package db

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"
)

var instance *gorm.DB

func Init() (*gorm.DB, error) {
	if instance != nil {
		return instance, nil
	}

	dir, err := os.UserConfigDir()
	if err != nil {
		dir = "."
	}
	dbPath := filepath.Join(dir, "mindstack", "chat.db")

	if err := os.MkdirAll(filepath.Dir(dbPath), 0755); err != nil {
		return nil, fmt.Errorf("create db dir: %w", err)
	}

	// busy_timeout tolerates concurrent writes from the CLI and the desktop
	// process instead of failing with SQLITE_BUSY; WAL improves cross-process
	// read/write concurrency.
	dsn := fmt.Sprintf("file:%s?_busy_timeout=5000&_journal_mode=WAL", dbPath)

	// gorm's default logger prints "record not found" at warn level to
	// stdout, which corrupts the CLI's JSON-only stdout. Log to stderr and
	// ignore ErrRecordNotFound instead.
	logger := gormlogger.New(
		log.New(os.Stderr, "", log.LstdFlags),
		gormlogger.Config{
			SlowThreshold:             time.Second,
			LogLevel:                  gormlogger.Warn,
			IgnoreRecordNotFoundError: true,
		},
	)

	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{Logger: logger})
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}

	instance = db
	return db, nil
}

func Get() *gorm.DB {
	if instance == nil {
		panic("db not initialized: call Init() first")
	}
	return instance
}

// Reset clears the singleton instance, useful for testing.
func Reset() {
	if instance != nil {
		sqlDB, _ := instance.DB()
		if sqlDB != nil {
			sqlDB.Close()
		}
		instance = nil
	}
}

// SetInstance sets the singleton instance, useful for testing.
func SetInstance(db *gorm.DB) {
	instance = db
}
