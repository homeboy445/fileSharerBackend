import npmlog from "npmlog";

npmlog.level = "verbose";

npmlog.enableColor();

const prefix = "fileSharer";

const logWrapper =
  (logger: (prefix: string, message: string, ...args: any) => void) =>
  (message: string, ...args: any) => {
    args.push("  -  logged at: " + (new Date()).toUTCString());
    return logger(prefix, message, ...args);
};

export default {
  info: logWrapper(npmlog.info),
  error: logWrapper(npmlog.error),
  warn: logWrapper(npmlog.warn),
};
