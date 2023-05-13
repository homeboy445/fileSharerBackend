"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const npmlog_1 = __importDefault(require("npmlog"));
npmlog_1.default.level = "verbose";
npmlog_1.default.enableColor();
const prefix = "fileSharer";
const logWrapper = (logger) => (message, ...args) => {
    return logger(prefix, message, ...args);
};
exports.default = {
    info: logWrapper(npmlog_1.default.info),
    error: logWrapper(npmlog_1.default.error),
    warn: logWrapper(npmlog_1.default.warn),
};
