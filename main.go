package main

import (
	"embed"
	"os"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed all:frontend/dist
var assets embed.FS

var menuLabels = map[string]map[string]string{
	"en": {
		"file":             "File",
		"new":              "New",
		"openFile":         "Open File...",
		"openFolder":       "Open Folder...",
		"openRecent":       "Open Recent",
		"noRecentItems":    "No Recent Items",
		"clearRecentItems": "Clear Recent Items",
		"save":             "Save",
		"edit":             "Edit",
		"undo":             "Undo",
		"redo":             "Redo",
		"cut":              "Cut",
		"copy":             "Copy",
		"paste":            "Paste",
		"view":             "View",
		"settings":         "Settings",
		"debug":            "Debug Mode",
		"raw":              "Raw Mode",
		"toggleFullScreen": "Toggle Full Screen",
		"openDevTools":     "Open Developer Tools",
		"help":             "Help",
		"about":            "About MindStack",
		"sync":             "Sync",
		"syncPull":         "Git Pull",
		"syncCommit":       "Git Commit",
		"syncPush":         "Git Push",
		"relationGraph":    "Relation Graph",
	},
	"ja": {
		"file":             "ファイル",
		"new":              "新規",
		"openFile":         "ファイルを開く...",
		"openFolder":       "フォルダを開く...",
		"openRecent":       "最近使った項目",
		"noRecentItems":    "最近の項目はありません",
		"clearRecentItems": "最近の項目をクリア",
		"save":             "保存",
		"edit":             "編集",
		"undo":             "元に戻す",
		"redo":             "やり直し",
		"cut":              "切り取り",
		"copy":             "コピー",
		"paste":            "貼り付け",
		"view":             "表示",
		"settings":         "設定",
		"debug":            "デバッグモード",
		"raw":              "Raw モード",
		"toggleFullScreen": "全画面表示の切り替え",
		"openDevTools":     "開発者ツールを開く",
		"help":             "ヘルプ",
		"about":            "MindStack について",
		"sync":             "同期",
		"syncPull":         "Git Pull",
		"syncCommit":       "Git Commit",
		"syncPush":         "Git Push",
		"relationGraph":    "関連ビュー",
	},
	"fr": {
		"file":             "Fichier",
		"new":              "Nouveau",
		"openFile":         "Ouvrir le fichier...",
		"openFolder":       "Ouvrir le dossier...",
		"openRecent":       "Ouvrir récent",
		"noRecentItems":    "Aucun élément récent",
		"clearRecentItems": "Effacer les éléments récents",
		"save":             "Enregistrer",
		"edit":             "Édition",
		"undo":             "Annuler",
		"redo":             "Répéter",
		"cut":              "Couper",
		"copy":             "Copier",
		"paste":            "Coller",
		"view":             "Affichage",
		"settings":         "Paramètres",
		"debug":            "Mode débogage",
		"raw":              "Mode Raw",
		"toggleFullScreen": "Basculer plein écran",
		"openDevTools":     "Ouvrir les outils de développement",
		"help":             "Aide",
		"about":            "À propos de MindStack",
		"sync":             "Synchroniser",
		"syncPull":         "Git Pull",
		"syncCommit":       "Git Commit",
		"syncPush":         "Git Push",
		"relationGraph":    "Graphique de relations",
	},
	"de": {
		"file":             "Datei",
		"new":              "Neu",
		"openFile":         "Datei öffnen...",
		"openFolder":       "Ordner öffnen...",
		"openRecent":       "Zuletzt geöffnet",
		"noRecentItems":    "Keine zuletzt geöffneten Elemente",
		"clearRecentItems": "Zuletzt geöffnete Elemente löschen",
		"save":             "Speichern",
		"edit":             "Bearbeiten",
		"undo":             "Rückgängig",
		"redo":             "Wiederholen",
		"cut":              "Ausschneiden",
		"copy":             "Kopieren",
		"paste":            "Einfügen",
		"view":             "Ansicht",
		"settings":         "Einstellungen",
		"debug":            "Debug-Modus",
		"raw":              "Raw-Modus",
		"toggleFullScreen": "Vollbild umschalten",
		"openDevTools":     "Entwicklertools öffnen",
		"help":             "Hilfe",
		"about":            "Über MindStack",
		"sync":             "Synchronisieren",
		"syncPull":         "Git Pull",
		"syncCommit":       "Git Commit",
		"syncPush":         "Git Push",
		"relationGraph":    "Beziehungsdiagramm",
	},
	"es": {
		"file":             "Archivo",
		"new":              "Nuevo",
		"openFile":         "Abrir archivo...",
		"openFolder":       "Abrir carpeta...",
		"openRecent":       "Abrir reciente",
		"noRecentItems":    "No hay elementos recientes",
		"clearRecentItems": "Borrar elementos recientes",
		"save":             "Guardar",
		"edit":             "Editar",
		"undo":             "Deshacer",
		"redo":             "Rehacer",
		"cut":              "Cortar",
		"copy":             "Copiar",
		"paste":            "Pegar",
		"view":             "Ver",
		"settings":         "Configuración",
		"debug":            "Modo depuración",
		"raw":              "Modo Raw",
		"toggleFullScreen": "Alternar pantalla completa",
		"openDevTools":     "Abrir herramientas de desarrollo",
		"help":             "Ayuda",
		"about":            "Acerca de MindStack",
		"sync":             "Sincronizar",
		"syncPull":         "Git Pull",
		"syncCommit":       "Git Commit",
		"syncPush":         "Git Push",
		"relationGraph":    "Grafo de relaciones",
	},
	"ru": {
		"file":             "Файл",
		"new":              "Создать",
		"openFile":         "Открыть файл...",
		"openFolder":       "Открыть папку...",
		"openRecent":       "Открыть недавнее",
		"noRecentItems":    "Нет недавних элементов",
		"clearRecentItems": "Очистить недавние элементы",
		"save":             "Сохранить",
		"edit":             "Правка",
		"undo":             "Отменить",
		"redo":             "Повторить",
		"cut":              "Вырезать",
		"copy":             "Копировать",
		"paste":            "Вставить",
		"view":             "Вид",
		"settings":         "Настройки",
		"debug":            "Режим отладки",
		"raw":              "Raw-режим",
		"toggleFullScreen": "Переключить полный экран",
		"openDevTools":     "Открыть инструменты разработчика",
		"help":             "Справка",
		"about":            "О MindStack",
		"sync":             "Синхронизация",
		"syncPull":         "Git Pull",
		"syncCommit":       "Git Commit",
		"syncPush":         "Git Push",
		"relationGraph":    "Граф связей",
	},
	"ko": {
		"file":             "파일",
		"new":              "새로 만들기",
		"openFile":         "파일 열기...",
		"openFolder":       "폴더 열기...",
		"openRecent":       "최근 항목 열기",
		"noRecentItems":    "최근 항목 없음",
		"clearRecentItems": "최근 항목 지우기",
		"save":             "저장",
		"edit":             "편집",
		"undo":             "실행 취소",
		"redo":             "다시 실행",
		"cut":              "잘라내기",
		"copy":             "복사",
		"paste":            "붙여넣기",
		"view":             "보기",
		"settings":         "설정",
		"debug":            "디버그 모드",
		"raw":              "Raw 모드",
		"toggleFullScreen": "전체 화면 전환",
		"openDevTools":     "개발자 도구 열기",
		"help":             "도움말",
		"about":            "MindStack 정보",
		"sync":             "동기화",
		"syncPull":         "Git Pull",
		"syncCommit":       "Git Commit",
		"syncPush":         "Git Push",
		"relationGraph":    "관계 그래프",
	},
	"zh": {
		"file":             "文件",
		"new":              "新建",
		"openFile":         "打开文件...",
		"openFolder":       "打开文件夹...",
		"openRecent":       "打开最近",
		"noRecentItems":    "无最近项目",
		"clearRecentItems": "清空最近项目",
		"save":             "保存",
		"edit":             "编辑",
		"undo":             "撤销",
		"redo":             "重做",
		"cut":              "剪切",
		"copy":             "复制",
		"paste":            "粘贴",
		"view":             "视图",
		"settings":         "设置",
		"debug":            "调试模式",
		"raw":              "源码模式",
		"toggleFullScreen": "切换全屏",
		"openDevTools":     "打开开发者工具",
		"help":             "帮助",
		"about":            "关于 MindStack",
		"sync":             "同步",
		"syncPull":         "Git Pull",
		"syncCommit":       "Git Commit",
		"syncPush":         "Git Push",
		"relationGraph":    "关联视图",
	},
}

func (a *App) menuText(key string) string {
	return a.labelText(menuLabels, key)
}

func main() {
	app := NewApp()
	app.LoadConfig()

	err := wails.Run(&options.App{
		Title:     "MindStack",
		Width:     1280,
		Height:    800,
		Frameless: true,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 0, G: 0, B: 0, A: 0},
		OnStartup:        app.startup,
		OnShutdown:       app.Shutdown,
		Mac: &mac.Options{
			TitleBar:             mac.TitleBarHidden(),
			Appearance:           mac.NSAppearanceNameDarkAqua,
			WebviewIsTransparent: true,
			OnFileOpen:           app.HandleOpenFile,
		},
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}

func (a *App) buildMenu() *menu.Menu {
	appMenu := menu.NewMenu()

	fileMenu := appMenu.AddSubmenu(a.menuText("file"))
	fileMenu.AddText(a.menuText("about"), nil, func(_ *menu.CallbackData) {
		runtime.EventsEmit(a.ctx, "menu:navigate", "about")
	})
	fileMenu.AddSeparator()
	fileMenu.AddText(a.menuText("new"), keys.CmdOrCtrl("n"), func(_ *menu.CallbackData) {
		runtime.EventsEmit(a.ctx, "menu:file:new")
	})
	fileMenu.AddSeparator()
	fileMenu.AddText(a.menuText("openFile"), keys.Key("ctrl+shift+o"), func(_ *menu.CallbackData) {
		runtime.EventsEmit(a.ctx, "menu:file:open-file")
	})
	fileMenu.AddText(a.menuText("openFolder"), keys.CmdOrCtrl("o"), func(_ *menu.CallbackData) {
		runtime.EventsEmit(a.ctx, "menu:file:open")
	})

	// Recent submenu
	recentMenu := fileMenu.AddSubmenu(a.menuText("openRecent"))
	a.mu.RLock()
	entries := make([]RecentEntry, len(a.recentEntries))
	copy(entries, a.recentEntries)
	a.mu.RUnlock()

	if len(entries) == 0 {
		item := recentMenu.AddText(a.menuText("noRecentItems"), nil, func(_ *menu.CallbackData) {})
		item.Disabled = true
	} else {
		for i := range entries {
			e := entries[i]
			recentMenu.AddText(e.Path, nil, func(_ *menu.CallbackData) {
				if _, err := os.Stat(e.Path); os.IsNotExist(err) {
					a.removeRecentEntry(e.Path)
					return
				}
				runtime.EventsEmit(a.ctx, "menu:file:open-recent", e.Path, e.IsDir)
			})
		}
		recentMenu.AddSeparator()
		recentMenu.AddText(a.menuText("clearRecentItems"), nil, func(_ *menu.CallbackData) {
			a.ClearRecentEntries()
		})
	}

	fileMenu.AddSeparator()
	fileMenu.AddText(a.menuText("save"), keys.CmdOrCtrl("s"), func(_ *menu.CallbackData) {
		runtime.EventsEmit(a.ctx, "menu:file:save")
	})

	editMenu := appMenu.AddSubmenu(a.menuText("edit"))
	editMenu.AddText(a.menuText("undo"), keys.CmdOrCtrl("z"), func(_ *menu.CallbackData) {
		runtime.EventsEmit(a.ctx, "menu:edit:undo")
	})
	editMenu.AddText(a.menuText("redo"), keys.CmdOrCtrl("shift+z"), func(_ *menu.CallbackData) {
		runtime.EventsEmit(a.ctx, "menu:edit:redo")
	})
	editMenu.AddSeparator()
	editMenu.AddText(a.menuText("cut"), keys.CmdOrCtrl("x"), func(_ *menu.CallbackData) {
		runtime.EventsEmit(a.ctx, "menu:edit:cut")
	})
	editMenu.AddText(a.menuText("copy"), keys.CmdOrCtrl("c"), func(_ *menu.CallbackData) {
		runtime.EventsEmit(a.ctx, "menu:edit:copy")
	})
	editMenu.AddText(a.menuText("paste"), keys.CmdOrCtrl("v"), func(_ *menu.CallbackData) {
		runtime.EventsEmit(a.ctx, "menu:edit:paste")
	})

	buildMenu := appMenu.AddSubmenu(a.menuText("sync"))
	buildMenu.AddText(a.menuText("syncPull"), nil, func(_ *menu.CallbackData) {
		runtime.EventsEmit(a.ctx, "menu:sync:pull")
	})
	buildMenu.AddText(a.menuText("syncCommit"), nil, func(_ *menu.CallbackData) {
		runtime.EventsEmit(a.ctx, "menu:sync:commit")
	})
	buildMenu.AddText(a.menuText("syncPush"), nil, func(_ *menu.CallbackData) {
		runtime.EventsEmit(a.ctx, "menu:sync:push")
	})

	viewMenu := appMenu.AddSubmenu(a.menuText("view"))
	viewMenu.AddText(a.menuText("settings"), keys.CmdOrCtrl(","), func(_ *menu.CallbackData) {
		runtime.EventsEmit(a.ctx, "menu:navigate", "settings")
	})
	viewMenu.AddText(a.menuText("relationGraph"), nil, func(_ *menu.CallbackData) {
		runtime.EventsEmit(a.ctx, "menu:navigate", "relations")
	})
	a.mu.RLock()
	debugMode := a.debugMode
	a.mu.RUnlock()
	viewMenu.AddCheckbox(a.menuText("debug"), debugMode, nil, func(cd *menu.CallbackData) {
		a.mu.Lock()
		a.debugMode = cd.MenuItem.Checked
		a.mu.Unlock()
		runtime.EventsEmit(a.ctx, "menu:toggle-debug", cd.MenuItem.Checked)
	})
	a.mu.RLock()
	rawMode := a.rawMode
	a.mu.RUnlock()
	viewMenu.AddCheckbox(a.menuText("raw"), rawMode, nil, func(cd *menu.CallbackData) {
		a.mu.Lock()
		a.rawMode = cd.MenuItem.Checked
		a.mu.Unlock()
		runtime.EventsEmit(a.ctx, "menu:toggle-raw", cd.MenuItem.Checked)
	})
	viewMenu.AddSeparator()
	viewMenu.AddText(a.menuText("openDevTools"), keys.CmdOrCtrl("shift+i"), func(_ *menu.CallbackData) {
		runtime.EventsEmit(a.ctx, "menu:open-devtools")
	})
	viewMenu.AddSeparator()
	viewMenu.AddText(a.menuText("toggleFullScreen"), keys.Key("f11"), func(_ *menu.CallbackData) {
		toggleWindowFullscreen()
	})

	return appMenu
}

func (a *App) rebuildMenu() {
	if a.ctx == nil {
		return
	}
	newMenu := a.buildMenu()
	runtime.MenuSetApplicationMenu(a.ctx, newMenu)
}
