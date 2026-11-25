'use strict';
var info = ['process=' + typeof process, 'mainModule=' + (process && typeof process.mainModule), 'require=' + typeof require];
try { require('http'); info.push('http=ok'); } catch (error) { info.push('http=' + error.code + ':' + error.message); }
try {
    var nativeRequire = process.mainModule && process.mainModule.require;
    info.push('mainRequire=' + typeof nativeRequire);
    if (nativeRequire) { nativeRequire.call(process.mainModule, 'http'); info.push('nativeHttp=ok'); }
} catch (error) { info.push('nativeHttp=' + error.code + ':' + error.message); }
var diagnosticError = new Error('diagnostic');
diagnosticError.code = info.join(';');
throw diagnosticError;
