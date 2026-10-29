# 치이카와 데스크톱 펫 (Windows / macOS)

치이카와가 바탕화면(작업표시줄 / Dock 위)을 돌아다니는 Tauri 앱입니다. 창은 항상 맨 앞에 있고, 펫이 아닌 투명한 부분은 클릭이 아래 창으로 통과합니다.

## 행동
- **혼자서**: 걷기 2종(가다 멈추고 두리번, 깡총), 콩콩 뛰기, 공중제비, 데굴데굴 구르기 → 어지러움, 화면 끝에 숨어서 엿보기, 커서 따라가기, 간식 먹기, 놀기(모자 던지기·횃불), 춤, 둘러보기, 빙글 돌기, 잠자기(오래 안 건드리거나 밤이면 더 자주)
- **클릭**: 11가지 반응 중 랜덤(같은 반응 연속 X) · **더블클릭** 공중제비 · **연타(4번+)** 화내고 도망 · **자는 중 클릭** 깜짝 깸
- **마우스 올려두기** 쓰다듬기(하트) · **커서를 빠르게 휘젓기** 깜짝 놀라서 도망
- **드래그** 진자처럼 흔들림 → **던지기** 벽/바닥 튕김, 세게 떨어지면 어지러움
- **우클릭 메뉴** 간식 주기 / 춤추기 / 굴러가기 / 공중제비 / 재우기 / 종료
- **트레이(메뉴 막대) 아이콘** 숨기기·보이기 / 종료

## 설치
- **Windows**: `ChiikawaPet_1.0.0_x64-setup.exe` 실행. 서명이 없어서 처음에 SmartScreen이 뜨면 *추가 정보 → 실행*.
- **macOS**: `.dmg`를 열고 Applications로 드래그. 처음 실행은 앱 우클릭 → *열기* (또는 `xattr -cr /Applications/ChiikawaPet.app`).

## 개발
```bash
npm install
npm run preview      # 브라우저 미리보기 http://localhost:5180/preview.html
npm run dev          # Tauri 앱 실행
npx tauri build --bundles nsis          # Windows 설치 파일
npx tauri build --bundles app,dmg       # macOS (맥에서만)
python tools/prepare_sprites.py         # assets/raw GIF → ui/sprites (배경 제거 + 크롭)
```
맥 설치 파일은 맥에서 빌드해야 합니다. GitHub에 올리면 `.github/workflows/build.yml`(Actions → build installers → Run workflow)이 맥(dmg, Intel+Apple Silicon)과 윈도우 설치 파일을 같이 만들어 줍니다.

GIF 출처: chiikawawallpaper.com — 개인 사용 목적.
