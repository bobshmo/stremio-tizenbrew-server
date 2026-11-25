'use strict';

var http = require('http');
var url = require('url');
var torrentStream = require('torrent-stream');

var HOST = '127.0.0.1';
var PORT = 11470;
var MAX_BODY = 65536;
var MAX_TORRENTS = 1;
var MAX_CONNECTIONS = 8;
var IDLE_MS = 120000;
var TEMP_ROOT = '/tmp/stremio-tizen-torrents';
var engines = Object.create(null);

function send(res, status, value, headers) {
    headers = headers || {};
    headers['Access-Control-Allow-Origin'] = '*';
    headers['Access-Control-Allow-Methods'] = 'GET,HEAD,POST,OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type,Range';
    headers['Cache-Control'] = 'no-store';
    if (typeof value === 'object' && !Buffer.isBuffer(value)) {
        headers['Content-Type'] = 'application/json; charset=utf-8';
        value = JSON.stringify(value);
    }
    res.writeHead(status, headers);
    if (res.req && res.req.method === 'HEAD') return res.end();
    res.end(value);
}

function readJson(req, callback) {
    var body = '';
    var finished = false;
    function finish(error, value) {
        if (finished) return;
        finished = true;
        callback(error, value);
    }
    req.setEncoding('utf8');
    req.on('data', function(chunk) {
        body += chunk;
        if (body.length > MAX_BODY) {
            finish(new Error('request too large'));
            req.destroy();
        }
    });
    req.on('end', function() {
        if (body.length > MAX_BODY) return;
        try { finish(null, body ? JSON.parse(body) : {}); }
        catch (error) { finish(error); }
    });
}

function normalizeHash(value) {
    var hash = String(value || '').toLowerCase();
    if (!/^[a-f0-9]{40}$/.test(hash)) return null;
    return hash;
}

function makeMagnet(hash, sources) {
    var parts = ['xt=urn:btih:' + hash];
    (Array.isArray(sources) ? sources : []).forEach(function(source) {
        source = String(source || '');
        if (/^(udp|http|https):\/\//i.test(source)) parts.push('tr=' + encodeURIComponent(source));
    });
    return 'magnet:?' + parts.join('&');
}

function chooseFile(files, guess) {
    var candidates = [];
    var video = /\.(mkv|mp4|m4v|avi|mov|webm|mpg|mpeg|ts|m2ts)$/i;
    files.forEach(function(file, index) {
        if (!video.test(file.name || file.path || '')) return;
        if (/sample|trailer|featurette/i.test(file.name || '')) return;
        candidates.push({ index: index, file: file });
    });
    if (!candidates.length) {
        files.forEach(function(file, index) {
            if (/\.(mkv|mp4|m4v|avi|mov|webm|mpg|mpeg|ts|m2ts)$/i.test(file.name || file.path || '')) {
                candidates.push({ index: index, file: file });
            }
        });
    }
    if (!candidates.length) return -1;
    var season = guess && Number(guess.season);
    var episode = guess && Number(guess.episode);
    if (season > 0 && episode > 0) {
        var pattern = new RegExp('s0*' + season + '[ ._-]*e0*' + episode + '(?:\\D|$)|' + season + 'x0*' + episode + '(?:\\D|$)', 'i');
        var match = candidates.filter(function(item) { return pattern.test(item.file.name || item.file.path || ''); });
        if (match.length) candidates = match;
    }
    candidates.sort(function(a, b) { return Number(b.file.length || 0) - Number(a.file.length || 0); });
    return candidates[0].index;
}

function destroyEngine(hash, force) {
    var entry = engines[hash];
    if (!entry || (!force && entry.readers > 0)) return;
    clearTimeout(entry.idleTimer);
    delete engines[hash];
    try { entry.engine.destroy(function() {}); } catch (error) { console.log('torrent cleanup: ' + error.message); }
}

function getEngine(hash, sources, callback) {
    var existing = engines[hash];
    if (existing) {
        existing.lastUsed = Date.now();
        return existing.ready ? callback(null, existing) : existing.waiters.push(callback);
    }
    var active = Object.keys(engines);
    while (active.length >= MAX_TORRENTS) {
        var oldest = active.map(function(key) { return engines[key]; }).filter(function(item) { return item.readers === 0; })
            .sort(function(a, b) { return a.lastUsed - b.lastUsed; })[0];
        if (!oldest) return callback(new Error('another torrent is currently playing'));
        destroyEngine(oldest.hash);
        active = Object.keys(engines);
    }
    var magnet = makeMagnet(hash, sources);
    var engine;
    try {
        engine = torrentStream(magnet, {
            connections: MAX_CONNECTIONS,
            uploads: 1,
            tmp: TEMP_ROOT,
            verify: true,
            dht: true,
            tracker: true
        });
    } catch (error) { return callback(error); }
    var entry = engines[hash] = { hash: hash, engine: engine, ready: false, error: null, readers: 0, lastUsed: Date.now(), waiters: [callback] };
    engine.on('ready', function() {
        entry.ready = true;
        var waiters = entry.waiters.splice(0);
        waiters.forEach(function(done) { done(null, entry); });
    });
    engine.on('error', function(error) {
        entry.error = error;
        console.log('torrent ' + hash + ': ' + (error && error.message || error));
        if (!entry.ready) {
            var waiters = entry.waiters.splice(0);
            waiters.forEach(function(done) { done(error); });
            destroyEngine(hash);
        }
    });
}

function parseByteRange(header, size) {
    if (!header) return { start: 0, end: size - 1, partial: false };
    var match = /^bytes=(\d*)-(\d*)$/.exec(header);
    if (!match) return null;
    var start = match[1] ? Number(match[1]) : null;
    var end = match[2] ? Number(match[2]) : null;
    if (start === null) {
        var suffix = end;
        if (!suffix || suffix < 0) return null;
        start = Math.max(0, size - suffix);
        end = size - 1;
    } else if (end === null || end >= size) end = size - 1;
    if (start < 0 || end < start || start >= size) return null;
    return { start: start, end: end, partial: true };
}

function contentType(name) {
    var ext = String(name || '').split('.').pop().toLowerCase();
    return ({ mp4: 'video/mp4', m4v: 'video/mp4', mkv: 'video/x-matroska', webm: 'video/webm', avi: 'video/x-msvideo', mov: 'video/quicktime', ts: 'video/mp2t', m2ts: 'video/mp2t' })[ext] || 'application/octet-stream';
}

function route(req, res) {
    var parsed = url.parse(req.url, true);
    var path = parsed.pathname || '/';
    if (req.method === 'OPTIONS') return send(res, 204, '');
    if (path === '/' || path === '/health') return send(res, 200, { status: 'ok', service: 'stremio-tizen', platform: 'tizen3-node4', activeTorrents: Object.keys(engines).length });
    if (path === '/opensubHash' || path === '/subtitleSignature') return send(res, 501, { error: 'subtitle metadata is not supported on this TV service' });
    var info = /^\/([a-f0-9]{40})\/(create|\d+|stats\.json)(?:\/stats\.json)?$/i.exec(path);
    if (!info) return send(res, 404, { error: 'not found' });
    var hash = normalizeHash(info[1]);
    if (!hash) return send(res, 400, { error: 'invalid info hash' });
    if (info[2] === 'create' && req.method === 'POST') {
        return readJson(req, function(error, body) {
            if (error) return send(res, 400, { error: error.message });
            getEngine(hash, body.peerSearch && body.peerSearch.sources, function(engineError, entry) {
                if (engineError) return send(res, 502, { error: engineError.message });
                var guess = body.guessFileIdx;
                var fileIdx = guess && typeof guess === 'object' ? chooseFile(entry.engine.files, guess) : -1;
                if (guess && typeof guess === 'object' && fileIdx < 0) return send(res, 404, { error: 'no playable video file found' });
                if (guess && typeof guess === 'object') entry.guessedFileIdx = fileIdx;
                send(res, 200, { guessedFileIdx: fileIdx });
            });
        });
    }
    var allStats = /^\/([a-f0-9]{40})\/stats\.json$/i.exec(path);
    var fileStats = /^\/([a-f0-9]{40})\/(\d+)\/stats\.json$/i.exec(path);
    var mediaPath = /^\/([a-f0-9]{40})\/(\d+)$/i.exec(path);
    var statsMatch = allStats || fileStats;
    var mediaMatch = mediaPath || fileStats;
    if (!statsMatch && !mediaMatch) {
        return send(res, 404, { error: 'not found' });
    }
    var statsOnly = !!statsMatch;
    var fileIdx = mediaMatch ? Number(mediaMatch[2]) : -1;
    getEngine(hash, parsed.query.tr ? (Array.isArray(parsed.query.tr) ? parsed.query.tr : [parsed.query.tr]) : [], function(engineError, entry) {
        if (engineError) return send(res, 502, { error: engineError.message });
        if (allStats) {
            var guessedFileIdx = typeof entry.guessedFileIdx === 'number' && entry.guessedFileIdx >= 0 ? entry.guessedFileIdx : chooseFile(entry.engine.files, {});
            return send(res, 200, {
                files: entry.engine.files.map(function(file) { return { name: file.name, length: file.length }; }),
                guessedFileIdx: guessedFileIdx
            });
        }
        if (!entry.engine.files[fileIdx]) return send(res, 404, { error: 'file index not found' });
        if (statsOnly) return send(res, 200, { streamName: entry.engine.files[fileIdx].name, infoHash: hash, fileIdx: fileIdx, length: entry.engine.files[fileIdx].length, downloaded: entry.engine.swarm.downloaded, peers: entry.engine.swarm.wires.length });
        var file = entry.engine.files[fileIdx];
        var range = parseByteRange(req.headers.range, file.length);
        if (!range) return send(res, 416, '', { 'Content-Range': 'bytes */' + file.length });
        var status = range.partial ? 206 : 200;
        var headers = {
            'Content-Type': contentType(file.name),
            'Accept-Ranges': 'bytes',
            'Content-Length': range.end - range.start + 1,
            'Connection': 'close'
        };
        if (range.partial) headers['Content-Range'] = 'bytes ' + range.start + '-' + range.end + '/' + file.length;
        headers['Access-Control-Allow-Origin'] = '*';
        headers['Access-Control-Allow-Headers'] = 'Range';
        headers['Cache-Control'] = 'no-store';
        res.writeHead(status, headers);
        if (req.method === 'HEAD') return res.end();
        entry.readers++;
        entry.lastUsed = Date.now();
        clearTimeout(entry.idleTimer);
        var stream = file.createReadStream({ start: range.start, end: range.end });
        var ended = false;
        function closeReader() {
            if (ended) return;
            ended = true;
            entry.readers = Math.max(0, entry.readers - 1);
            entry.lastUsed = Date.now();
            if (entry.readers === 0) entry.idleTimer = setTimeout(function() { destroyEngine(hash); }, IDLE_MS);
        }
        stream.on('error', function(error) { console.log('stream ' + hash + ': ' + error.message); closeReader(); if (!res.headersSent) res.writeHead(502); res.end(); });
        stream.on('end', closeReader);
        res.on('close', function() { try { stream.destroy(); } catch (error) {} closeReader(); });
        stream.pipe(res);
    });
}

module.exports.onStart = function() {
    if (module.exports.server) return;
    module.exports.server = http.createServer(function(req, res) {
        try { route(req, res); }
        catch (error) { console.log('request error: ' + error.stack); if (!res.headersSent) send(res, 500, { error: 'internal error' }); else res.end(); }
    });
    module.exports.server.listen(PORT, HOST, function() { console.log('Stremio torrent service listening at http://' + HOST + ':' + PORT); });
};

module.exports.onStop = function() {
    Object.keys(engines).forEach(function(hash) { destroyEngine(hash, true); });
    if (module.exports.server) module.exports.server.close();
    module.exports.server = null;
};

