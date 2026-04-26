package main

import (
	"embed"
	"os"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
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
		"toggleFullScreen": "Toggle Full Screen",
		"help":             "Help",
		"about":            "About MindStack",
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
		"toggleFullScreen": "全画面表示の切り替え",
		"help":             "ヘルプ",
		"about":            "MindStack について",
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
		"toggleFullScreen": "Basculer plein écran",
		"help":             "Aide",
		"about":            "À propos de MindStack",
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
		"toggleFullScreen": "Vollbild umschalten",
		"help":             "Hilfe",
		"about":            "Über MindStack",
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
		"toggleFullScreen": "Alternar pantalla completa",
		"help":             "Ayuda",
		"about":            "Acerca de MindStack",
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
		"toggleFullScreen": "Переключить полный экран",
		"help":             "Справка",
		"about":            "О MindStack",
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
		"toggleFullScreen": "전체 화면 전환",
		"help":             "도움말",
		"about":            "MindStack 정보",
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
		"toggleFullScreen": "切换全屏",
		"help":             "帮助",
		"about":            "关于 MindStack",
	},
}

func (a *App) menuText(key string) string {
	return a.labelText(menuLabels, key)
}

func main() {
	app := NewApp()
	app.LoadConfig()

	err := wails.Run(&options.App{
		Title:  "MindStack",
		Width:  1280,
		Height: 800,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 27, G: 38, B: 54, A: 1},
		OnStartup:        app.startup,
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

	viewMenu := appMenu.AddSubmenu(a.menuText("view"))
	viewMenu.AddText(a.menuText("settings"), keys.CmdOrCtrl(","), func(_ *menu.CallbackData) {
		runtime.EventsEmit(a.ctx, "menu:navigate", "settings")
	})
	viewMenu.AddSeparator()
	viewMenu.AddText(a.menuText("toggleFullScreen"), keys.Key("f11"), func(_ *menu.CallbackData) {
		runtime.WindowToggleMaximise(a.ctx)
	})

	helpMenu := appMenu.AddSubmenu(a.menuText("help"))
	helpMenu.AddText(a.menuText("about"), nil, func(_ *menu.CallbackData) {
		runtime.EventsEmit(a.ctx, "menu:navigate", "about")
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
