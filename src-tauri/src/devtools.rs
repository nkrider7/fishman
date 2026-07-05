use tauri::WebviewWindow;

#[tauri::command]
pub fn toggle_devtools(window: WebviewWindow) -> bool {
    if window.is_devtools_open() {
        window.close_devtools();
        false
    } else {
        window.open_devtools();
        true
    }
}
