// Logger utility with color support

// ANSI color codes
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  underscore: "\x1b[4m",
  blink: "\x1b[5m",
  reverse: "\x1b[7m",
  hidden: "\x1b[8m",

  black: "\x1b[30m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",

  bgBlack: "\x1b[40m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
  bgMagenta: "\x1b[45m",
  bgCyan: "\x1b[46m",
  bgWhite: "\x1b[47m",
};

// Predefined color schemes for different components
const schemes = {
  SERVER: {
    prefix: colors.bgBlue + colors.white + "[SERVER]" + colors.reset,
    info: colors.blue,
    error: colors.red,
  },
  SONIC: {
    prefix: colors.bgCyan + colors.white + "[SONIC]" + colors.reset,
    info: colors.cyan,
    error: colors.red,
  },
  XION: {
    prefix: colors.bgGreen + colors.white + "[XION]" + colors.reset,
    info: colors.green,
    error: colors.red,
  },
};

// Logger class to handle different logging types
class Logger {
  component: string;

  constructor(component: "SERVER" | "SONIC" | "XION") {
    this.component = component;
  }

  private getTime(): string {
    return colors.dim + new Date().toISOString() + colors.reset;
  }

  info(message: string, ...args: any[]): void {
    const scheme = schemes[this.component as keyof typeof schemes];
    console.log(
      `${this.getTime()} ${scheme.prefix} ${scheme.info}${message}${
        colors.reset
      }`,
      ...args
    );
  }

  error(message: string, ...args: any[]): void {
    const scheme = schemes[this.component as keyof typeof schemes];
    console.error(
      `${this.getTime()} ${scheme.prefix} ${colors.red}ERROR: ${message}${
        colors.reset
      }`,
      ...args
    );
  }

  warn(message: string, ...args: any[]): void {
    const scheme = schemes[this.component as keyof typeof schemes];
    console.warn(
      `${this.getTime()} ${scheme.prefix} ${colors.yellow}WARNING: ${message}${
        colors.reset
      }`,
      ...args
    );
  }

  success(message: string, ...args: any[]): void {
    const scheme = schemes[this.component as keyof typeof schemes];
    console.log(
      `${this.getTime()} ${scheme.prefix} ${colors.green}SUCCESS: ${message}${
        colors.reset
      }`,
      ...args
    );
  }

  debug(message: string, ...args: any[]): void {
    if (process.env.DEBUG !== "true") return;

    const scheme = schemes[this.component as keyof typeof schemes];
    console.log(
      `${this.getTime()} ${scheme.prefix} ${colors.dim}DEBUG: ${message}${
        colors.reset
      }`,
      ...args
    );
  }

  highlight(message: string, ...args: any[]): void {
    const scheme = schemes[this.component as keyof typeof schemes];
    console.log(
      `${this.getTime()} ${scheme.prefix} ${colors.bright}${
        colors.yellow
      }${message}${colors.reset}`,
      ...args
    );
  }
}

// Export pre-configured loggers
export const serverLogger = new Logger("SERVER");
export const sonicLogger = new Logger("SONIC");
export const xionLogger = new Logger("XION");

// Also export the logger class for custom usage
export default Logger;
