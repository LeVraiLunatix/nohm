use std::sync::Mutex;
use std::time::Duration;

use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager, RunEvent,
};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

/// The bundled Node server the app runs alongside the window. Held so it can be killed on exit.
struct Sidecar(Mutex<Option<CommandChild>>);

const SERVER_PORT: u16 = 4821;

/// Block until the server is accepting connections (Express starts listening only once every
/// provider is wired), or give up after ~48 s so a broken build still shows its window.
fn wait_for_server() {
    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], SERVER_PORT));
    for _ in 0..120 {
        if std::net::TcpStream::connect_timeout(&addr, Duration::from_millis(400)).is_ok() {
            return;
        }
        std::thread::sleep(Duration::from_millis(400));
    }
}

/// Spawn `node tsx server/src/index.ts` from the bundled resources, writing its state to
/// %APPDATA%\Nohm (the executable's own directory is read-only under Program Files).
fn start_server(app: &tauri::AppHandle) -> Result<CommandChild, Box<dyn std::error::Error>> {
    let resource_dir = app.path().resource_dir()?;
    let server_dir = resource_dir.join("resources").join("server");
    let data_dir = app.path().app_data_dir()?;
    std::fs::create_dir_all(&data_dir).ok();

    let client_dist = resource_dir.join("resources").join("client");

    // `--import tsx` runs the TypeScript entry in-process (one PID to kill) using the tsx that
    // prepare-resources.mjs installed into the staged server/node_modules.
    let (mut events, child) = app
        .shell()
        .sidecar("node")?
        .args(["--import", "tsx", "src/index.ts"])
        .current_dir(&server_dir)
        .env("NODE_ENV", "production")
        .env("PORT", SERVER_PORT.to_string())
        .env("NOHM_DATA_DIR", data_dir.to_string_lossy().to_string())
        .env("NOHM_CLIENT_DIST", client_dist.to_string_lossy().to_string())
        .spawn()?;

    // Keep draining the pipe or the child blocks once its buffer fills.
    tauri::async_runtime::spawn(async move {
        while let Some(event) = events.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    println!("[nohm-server] {}", String::from_utf8_lossy(&line))
                }
                CommandEvent::Stderr(line) => {
                    eprintln!("[nohm-server] {}", String::from_utf8_lossy(&line))
                }
                CommandEvent::Error(err) => eprintln!("[nohm-server] {err}"),
                CommandEvent::Terminated(payload) => {
                    eprintln!("[nohm-server] exited with {:?}", payload.code);
                    break;
                }
                _ => {}
            }
        }
    });

    Ok(child)
}

async fn check_for_update(app: tauri::AppHandle) {
    use tauri_plugin_updater::UpdaterExt;
    let updater = match app.updater() {
        Ok(updater) => updater,
        Err(err) => {
            eprintln!("[nohm-update] updater unavailable: {err}");
            return;
        }
    };
    match updater.check().await {
        Ok(Some(update)) => {
            println!("[nohm-update] installing {}", update.version);
            if let Err(err) = update.download_and_install(|_, _| {}, || {}).await {
                eprintln!("[nohm-update] install failed: {err}");
                return;
            }
            app.restart();
        }
        Ok(None) => {}
        Err(err) => eprintln!("[nohm-update] check failed: {err}"),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        // Must be registered first so no second process initializes plugins or windows.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(Sidecar(Mutex::new(None)))
        .setup(|app| {
            let open = MenuItem::with_id(app, "open", "Ouvrir Nohm", true, None::<&str>)?;
            let game = CheckMenuItem::with_id(app, "game-mode", "Mode jeu", true, false, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quitter Nohm", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &game, &quit])?;
            let game_for_menu = game.clone();
            TrayIconBuilder::with_id("nohm-tray")
                .icon(app.default_window_icon().expect("icône Nohm manquante").clone())
                .tooltip("Nohm")
                .menu(&menu)
                .on_menu_event(move |app, event| match event.id().as_ref() {
                    "open" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "game-mode" => {
                        let active = if game_for_menu.is_checked().unwrap_or(false) { "true" } else { "false" };
                        if let Some(window) = app.get_webview_window("main") {
                            // Placeholder-substitution instead of format!: the JS is full of literal
                            // braces and escaping them all into a format string is how this broke before.
                            let script = concat!(
                                "document.documentElement.dataset.gameMode='__A__';",
                                "localStorage.setItem('nohm.gameMode','__A__');",
                                "fetch('/api/game-mode',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({active:__A__})}).catch(()=>{});",
                                "window.dispatchEvent(new CustomEvent('nohm:game-mode-change',{detail:{active:__A__}}));"
                            )
                            .replace("__A__", active);
                            let _ = window.eval(&script);
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            // In a `tauri dev` run the dev stack (Vite on 5173, which proxies /api to the 4822
            // server) is already up via beforeDevCommand — point the window there and skip the
            // sidecar. A release build starts and waits for its own bundled server.
            if cfg!(debug_assertions) {
                if let Some(mut window) = app.get_webview_window("main") {
                    if let Ok(url) = "http://127.0.0.1:5173".parse() {
                        let _ = window.navigate(url);
                    }
                    let _ = window.show();
                }
            } else {
                let handle = app.handle().clone();
                match start_server(&handle) {
                    Ok(child) => {
                        app.state::<Sidecar>().0.lock().unwrap().replace(child);
                    }
                    Err(err) => eprintln!("[nohm-server] could not start: {err}"),
                }
                let ready_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    let _ = tauri::async_runtime::spawn_blocking(wait_for_server).await;
                    if let Some(mut window) = ready_handle.get_webview_window("main") {
                        if let Ok(url) = "http://127.0.0.1:4821".parse() {
                            let _ = window.navigate(url);
                        }
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                });
                let update_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move { check_for_update(update_handle).await });
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("échec du lancement de Nohm");

    app.run(|app_handle, event| {
        if let RunEvent::Exit = event {
            if let Some(child) = app_handle.state::<Sidecar>().0.lock().unwrap().take() {
                let _ = child.kill();
            }
        }
    });
}
