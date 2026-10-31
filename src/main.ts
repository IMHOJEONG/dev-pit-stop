import './game/ui/styles/index.css';
import { createUI } from './game/ui/shell';
import { $ } from './game/ui/dom';
import { Game } from './game/app/game';
createUI();
let game: Game | undefined;
try {
  game = new Game();
} catch (error) {
  console.error('Wild Atlas failed to start:', error);
  $('loading').innerHTML =
    '<strong>3D 화면을 시작하지 못했어요</strong><span>WebGL 2를 지원하는 브라우저에서 하드웨어 가속을 켠 뒤 새로고침해 주세요.</span><button class="primary-button" id="retry">다시 시작하기</button>';
  $('retry').onclick = () => location.reload();
}
if (import.meta.hot) import.meta.hot.dispose(() => game?.dispose());
