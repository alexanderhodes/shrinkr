#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::{Path, PathBuf};

use tauri::ipc::{InvokeBody, Request, Response};

const IMAGE_EXTENSIONS: &[&str] = &[
    "jpg", "jpeg", "png", "webp", "avif", "gif", "bmp", "tif", "tiff", "heic", "heif",
];

fn is_image(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| IMAGE_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

fn collect_images(path: &Path, out: &mut Vec<String>, depth: u8) {
    if path.is_dir() {
        if depth == 0 {
            return;
        }
        let Ok(read_dir) = fs::read_dir(path) else {
            return;
        };
        let mut entries: Vec<PathBuf> = read_dir.filter_map(|e| e.ok().map(|e| e.path())).collect();
        entries.sort();
        for entry in entries {
            let hidden = entry
                .file_name()
                .and_then(|n| n.to_str())
                .map(|n| n.starts_with('.'))
                .unwrap_or(false);
            if !hidden {
                collect_images(&entry, out, depth - 1);
            }
        }
    } else if is_image(path) {
        if let Some(s) = path.to_str() {
            out.push(s.to_string());
        }
    }
}

/// Wandelt gedroppte Pfade in eine Liste von Bilddateien um (Ordner werden durchsucht).
#[tauri::command]
fn expand_paths(paths: Vec<String>) -> Vec<String> {
    let mut out = Vec::new();
    for p in paths {
        collect_images(Path::new(&p), &mut out, 4);
    }
    out
}

/// Liest eine Datei als rohe Bytes (kommt im Frontend als ArrayBuffer an).
#[tauri::command]
fn read_file(path: String) -> Result<Response, String> {
    fs::read(&path)
        .map(Response::new)
        .map_err(|e| format!("{path}: {e}"))
}

/// Schreibt rohe Bytes in eine Datei. Der Zielpfad kommt URL-kodiert im Header `path`.
#[tauri::command]
fn write_file(request: Request) -> Result<(), String> {
    let InvokeBody::Raw(data) = request.body() else {
        return Err("Ungültige Daten".into());
    };
    let raw_path = request
        .headers()
        .get("path")
        .and_then(|v| v.to_str().ok())
        .ok_or("Zielpfad fehlt")?;
    let path = urlencoding::decode(raw_path)
        .map_err(|e| e.to_string())?
        .into_owned();
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| format!("{}: {e}", parent.display()))?;
    }
    fs::write(&path, data).map_err(|e| format!("{path}: {e}"))
}

/// Zeigt eine Datei im Finder an.
#[tauri::command]
fn reveal_in_finder(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-R", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = path;
    }
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            expand_paths,
            read_file,
            write_file,
            reveal_in_finder
        ])
        .run(tauri::generate_context!())
        .expect("Fehler beim Starten von Shrinkr");
}
