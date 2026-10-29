// Chiikawa desktop pet: each pet is a small transparent always-on-top window that the
// web side (ui/pet.js) moves around the screen every frame through the `frame` command.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::atomic::{AtomicUsize, Ordering};

use serde::Serialize;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

const BOX: f64 = 240.0;
static PET_COUNT: AtomicUsize = AtomicUsize::new(0);

#[derive(Serialize)]
struct Frame {
    cursor: (f64, f64),
    // work area of the monitor the pet is on: left, top, right, bottom (logical px)
    area: (f64, f64, f64, f64),
}

/// Move the pet window (x, y = top-left in logical px), toggle click-through and report
/// where the cursor and the usable screen area are. One round trip per animation frame.
#[tauri::command]
fn frame(window: WebviewWindow, x: f64, y: f64, through: bool, raise: bool) -> Frame {
    let monitor = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten());
    let (scale, area) = match &monitor {
        Some(m) => {
            let s = m.scale_factor();
            let wa = m.work_area();
            let (l, t) = (wa.position.x as f64 / s, wa.position.y as f64 / s);
            (s, (l, t, l + wa.size.width as f64 / s, t + wa.size.height as f64 / s))
        }
        None => (1.0, (0.0, 0.0, 1280.0, 800.0)),
    };
    let _ = window.set_position(PhysicalPosition::new((x * scale).round() as i32, (y * scale).round() as i32));
    let _ = window.set_ignore_cursor_events(through);
    if raise {
        // other "topmost" windows (taskbar, overlays) can end up above us; re-assert our place
        let _ = window.set_always_on_top(true);
    }
    let c = window.cursor_position().unwrap_or(PhysicalPosition::new(-9999.0, -9999.0));
    Frame { cursor: (c.x / scale, c.y / scale), area }
}

#[tauri::command]
fn quit(app: AppHandle) {
    app.exit(0);
}

fn spawn_pet(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let n = PET_COUNT.fetch_add(1, Ordering::Relaxed);
    let builder = WebviewWindowBuilder::new(app, format!("pet-{n}"), WebviewUrl::App("index.html".into()))
        .title("Chiikawa")
        .inner_size(BOX, BOX)
        .position(-1000.0, -1000.0)
        .resizable(false)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible_on_all_workspaces(true)
        .focused(false)
        .accept_first_mouse(true);
    #[cfg(windows)]
    let builder = builder.focusable(false);
    builder.build()
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![frame, quit])
        .setup(|app| {
            // no Dock icon on macOS: the pet lives on the desktop and in the menu bar
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let toggle = MenuItem::with_id(app, "toggle", "숨기기 / 보이기", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "종료", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&toggle, &quit])?;
            TrayIconBuilder::new()
                .icon(app.default_window_icon().cloned().expect("app icon"))
                .tooltip("치이카와")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "toggle" => {
                        for w in app.webview_windows().values() {
                            let visible = w.is_visible().unwrap_or(true);
                            let _ = if visible { w.hide() } else { w.show() };
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            spawn_pet(app.handle())?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Chiikawa pet");
}
