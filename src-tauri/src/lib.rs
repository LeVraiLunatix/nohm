use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager,
};
use tauri_plugin_autostart::MacosLauncher;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must be registered first so no second process initializes plugins or windows.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec!["--minimized"])))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
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
                        let active = game_for_menu.is_checked().unwrap_or(false);
                        if let Some(window) = app.get_webview_window("main") {
                            let script = format!("document.documentElement.dataset.gameMode='{active}';localStorage.setItem('nohm.gameMode','{active}');fetch('/api/game-mode',{{method:'POST',headers:{{'content-type':'application/json'}},body:JSON.stringify({{active:{active}}})}}).catch(()=>{{}});window.dispatchEvent(new CustomEvent('nohm:game-mode-change',{{detail:{{active:{active}}}}}}));");
                            let _ = window.eval(&script);
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("échec du lancement de Nohm");
}
