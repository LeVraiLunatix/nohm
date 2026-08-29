import { useGameMode } from './GameModeProvider';

export function GameModeButton() {
  const { active, toggle } = useGameMode();
  return <button type="button" className={`game-mode-button${active ? ' is-active' : ''}`} aria-pressed={active} title="Mode jeu · Alt+Maj+G" onClick={toggle}><span aria-hidden>◈</span><span className="game-mode-label">{active ? 'Mode jeu actif' : 'Mode jeu'}</span></button>;
}
