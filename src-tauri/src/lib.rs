mod devtools;
mod git_http;
mod http;
mod system_stats;

use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "init",
            sql: include_str!("../migrations/001_init.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "environments",
            sql: include_str!("../migrations/002_environments.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "request_scripts",
            sql: include_str!("../migrations/003_scripts.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "git_native_collections",
            sql: include_str!("../migrations/004_git_native.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "cookies",
            sql: include_str!("../migrations/005_cookies.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "workspace_scope_history_cookies",
            sql: include_str!("../migrations/006_workspace_scope.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "request_tags",
            sql: include_str!("../migrations/007_request_tags.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "folder_settings",
            sql: include_str!("../migrations/008_folder_settings.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        // Configured in tauri.conf.json: plugins.fs.requireLiteralLeadingDot = false
        // so `.git` / `.gitignore` are accessible on Unix.
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:fishman.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            http::execute_request,
            git_http::git_http_request,
            devtools::toggle_devtools,
            system_stats::get_system_stats,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
