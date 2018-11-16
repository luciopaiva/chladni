
/**
 * https://stackoverflow.com/a/52827031/778272
 * @returns {Boolean} true if system is big endian */
const isBigEndian = (() => {
    const array = new Uint8Array(4);
    const view = new Uint32Array(array.buffer);
    return !((view[0] = 1) & array[0]);
})();
console.info("Endianness: " + (isBigEndian ? "big" : "little"));

const rgbToVal = isBigEndian ?
    (r, g, b) => ((r << 24) | (g << 16) | (b << 8) | 0xff) >>> 0:
    (r, g, b) => ((0xff << 24) | (b << 16) | (g << 8) | r) >>> 0;

function readCssVar(varName) {
    varName = varName.startsWith("--") ? varName : "--" + varName;
    return window.getComputedStyle(document.documentElement).getPropertyValue(varName);
}

function readCssVarAsHexNumber(varName) {
    const strValue = readCssVar(varName);
    return strValue ? parseInt(strValue.replace(/[^a-fA-F0-9]/g, ""), 16) : null;
}

function cssColorToColor(cssColor) {
    return rgbToVal(cssColor >>> 16 & 0xff, cssColor >>> 8 & 0xff, cssColor & 0xff);
}

class Debouncer {
    constructor () { this.timer = null; }
    set(task, delay) {
        if (this.timer) {
            clearTimeout(this.timer);
        }
        this.timer = setTimeout(() => {
            this.timer = null;
            task();
        }, delay);
    }
}

export {
    isBigEndian,
    rgbToVal,
    readCssVarAsHexNumber,
    cssColorToColor,
    Debouncer,
};
