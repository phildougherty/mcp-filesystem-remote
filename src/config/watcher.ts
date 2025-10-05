import chokidar, { FSWatcher } from "chokidar";
import { EventEmitter } from "events";
import { loadConfigFromFile, validateConfig, normalizePaths } from "./loader.js";
import { Config } from "./schema.js";

/**
 * Configuration file watcher with hot reload support
 */
export class ConfigWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null;
  private configPath: string;
  private currentConfig: Config;
  private debounceTimer: NodeJS.Timeout | null = null;
  private debounceDelay: number = 1000; // 1 second debounce

  constructor(configPath: string, initialConfig: Config) {
    super();
    this.configPath = configPath;
    this.currentConfig = initialConfig;
  }

  /**
   * Start watching the config file for changes
   */
  start(): void {
    if (this.watcher) {
      console.error("Config watcher already started");
      return;
    }

    this.watcher = chokidar.watch(this.configPath, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
    });

    this.watcher.on("change", () => {
      this.handleConfigChange();
    });

    this.watcher.on("error", (error: unknown) => {
      console.error("Config watcher error:", error);
      this.emit("error", error);
    });

    console.error(`Config watcher started for: ${this.configPath}`);
  }

  /**
   * Stop watching the config file
   */
  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
      console.error("Config watcher stopped");
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  /**
   * Handle config file changes with debouncing
   */
  private handleConfigChange(): void {
    // Clear existing debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Set new debounce timer
    this.debounceTimer = setTimeout(async () => {
      try {
        console.error("Config file changed, reloading...");

        // Load and validate new config
        const newConfigData = await loadConfigFromFile(this.configPath);
        const validatedConfig = validateConfig(newConfigData);
        const normalizedConfig = normalizePaths(validatedConfig);

        // Check if config actually changed
        if (JSON.stringify(this.currentConfig) === JSON.stringify(normalizedConfig)) {
          console.error("Config content unchanged, skipping reload");
          return;
        }

        // Emit reload event with old and new configs
        this.emit("reload", {
          old: this.currentConfig,
          new: normalizedConfig,
        });

        this.currentConfig = normalizedConfig;
        console.error("Config successfully reloaded");
      } catch (error) {
        console.error("Failed to reload config:", error);
        this.emit("error", error);
      }
    }, this.debounceDelay);
  }

  /**
   * Get the current config
   */
  getCurrentConfig(): Config {
    return this.currentConfig;
  }

  /**
   * Manually update the current config (for testing or external updates)
   */
  updateConfig(newConfig: Config): void {
    this.currentConfig = newConfig;
  }
}

/**
 * Create and start a config watcher
 */
export function createConfigWatcher(
  configPath: string,
  initialConfig: Config,
  onReload?: (oldConfig: Config, newConfig: Config) => void | Promise<void>,
  onError?: (error: Error) => void
): ConfigWatcher {
  const watcher = new ConfigWatcher(configPath, initialConfig);

  if (onReload) {
    watcher.on("reload", async ({ old, new: newConfig }) => {
      await onReload(old, newConfig);
    });
  }

  if (onError) {
    watcher.on("error", onError);
  }

  watcher.start();

  return watcher;
}
