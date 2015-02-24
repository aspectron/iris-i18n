//
// -- Zetta Toolkit - Site Localisation Module
//
//  Copyright (c) 2014-2015 ASPECTRON Inc.
//  All Rights Reserved.
//
//  Permission is hereby granted, free of charge, to any person obtaining a copy
//  of this software and associated documentation files (the "Software"), to deal
//  in the Software without restriction, including without limitation the rights
//  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
//  copies of the Software, and to permit persons to whom the Software is
//  furnished to do so, subject to the following conditions:
// 
//  The above copyright notice and this permission notice shall be included in
//  all copies or substantial portions of the Software.
// 
//  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
//  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
//  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
//  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
//  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
//  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
//  THE SOFTWARE.
//

var _ = require("underscore");
var path = require("path");
var crypto = require("crypto");
var fs = require("fs");
var ejs = require('ejs');
var util = require('util');
var events = require('events');
var basicAuth = require('basic-auth');

if(!GLOBAL.dpc)
    GLOBAL.dpc = function(t,fn) { if(typeof(t) == 'function') setTimeout(t,0); else setTimeout(fn,t); }

String.prototype.strtr = function (replacePairs) {
    var str = this.toString(), key, re;

    for (key in replacePairs) {
        if (replacePairs.hasOwnProperty(key)) {
            re = new RegExp(key, "g");
            str = str.replace(re, replacePairs[key]);
        }
    }
    return str;
};

String.prototype.$ = function (replacePairs) {
    var str = this.toString(), key, re;

    for (key in replacePairs) {
        if (replacePairs.hasOwnProperty(key)) {
            str = str.replace(key, replacePairs[key]);
        }
    }
    return str;
};

function i18n(core) {
    var self = this;
    events.EventEmitter.call(this);

    self.configFile = path.join(core.appFolder,'config/i18n.conf');
    self.sitemapFile = path.join(core.appFolder,'config/sitemap.conf');
    //self.userSettingFile = path.join(core.appFolder,'config/i18n.user.conf');
    self.entriesFile = path.join(core.appFolder,'config/i18n.data');

    //self.userSettings = core.readJSON(self.userSettingFile);
    self.config = core.readJSON(self.configFile);
    self.sitemapConfig = core.readJSON(self.sitemapFile);
    //self.entries = core.readJSON(self.entriesFile) || { }
    self.basicCategory = 'basic';
    self.flush = false;

    self.entries = { }
    restoreEntries(self.entriesFile);

    _.each(self.entries, function(entry) {
        entry.orphan = true;
    })

    self.storeConfig = function() {
        core.writeJSON(self.configFile, self.config);
    }
    /*
    self.storeUserSettings = function() {
        core.writeJSON(self.userSettingFile, self.userSettings);
    }
    */

    function PAD(t) {
        while(t.length < 12)
            t += ' ';
        return t;
    }

    self.storeEntries = _.throttle(function() {
        console.log("i18n - storing "+_.size(self.entries)+" entires.")
        var lines = []

        var list = _.values(self.entries);
        for(var i = 0; i < list.length; i++) {
            var e = list[i];
            var n = e.hash;

            lines.push(n+'.');

            _.each(e, function(l, ident) {
                if(ident == 'locale' || ident == 'files')
                    return;
                lines.push(n+PAD('.'+ident)+JSON.stringify(l));
            })

            // lines.push(n+'.files')
            _.each(e.files, function(l, ident) {
                lines.push(n+PAD('.file')+JSON.stringify(l));
            })

            //lines.push(n+':\t"locale": {')
            //var locale = [ ]
            _.each(e.locale, function(l, ident) {
                lines.push(n+PAD('.locale.'+ident)+JSON.stringify(l));
            })
            //lines.push(locale.join(',\n'));
            //lines.push(n+':\t}'+( i == list.length-1 ? '' : ',' ))

            lines.push(n+'.');
        }

        var text = lines.join('\n');
//        var text = '{\n'+lines.join('\n')+'\n}';

        fs.writeFileSync(self.entriesFile, text);
        // core.writeJSON(self.entriesFile, self.entries);

        //var jsonxml = require('jsontoxml');
        //var xml = jsonxml(self.entries, { prettyPrint : true });
        //fs.writeFileSync(self.entriesFile.replace('.data','.xml'), xml);
    }, 3000);


    function restoreEntries(file) {
        if(!fs.existsSync(file)) {
            console.log("i18n.data not found, creating...".magenta.bold);
            return;
        }

        var data = fs.readFileSync(file, { encoding : 'utf8'});
        //self.entries = JSON.parse(data.replace(/^.*:\s?/gm,''));
        var lines = data.split('\n');
        _.each(lines, function(l) {

            var ident = l.match(/^\S{2,}/).shift();
            if(!ident)
                return;

            // console.log('ident:',ident);
            // console.log('arg:',l.substr(ident.length));
            var arg = l.substr(ident.length);
            if(!arg || !arg.length)
                return;

            var v = JSON.parse(l.substr(ident.length));
            ident = ident.split('.');
            var hash = ident.shift();
            // console.log("hash:",hash)
            var e = self.entries[hash];
            if(!e) {
                e = self.entries[hash] = { files : [ ], locale : { } }
            }

            var prop = ident.shift();
            if(!prop || !prop.length)
                return;

            if(prop == 'file') {
                e.files.push(v);
            }
            else
            if(prop == 'locale') {
                var locale = ident.shift();
                e.locale[locale] = v;
            }
            else
                e[prop] = v;

            if(!e.hash)
                return;

            self.entries[e.hash] = e;
        })

    }

    self.updateEnabled = function() {
        self.enabledLanguages = _.pick(self.config.languages, function(v, code) { return v.enabled || code == self.config.sourceLanguage; })
    }
    self.updateEnabled();


    self.webSocketMap = { }

    self.dispatchToAll = function(msg, exclude){
        _.each(self.webSocketMap, function(dest, id) {
            if(!exclude || exclude != id)
                dest.emit('message', msg);
        });
    }

    core.on('init::websockets', function() {

        core.io.of('/i18n-rpc').on('connection', function(socket) {
            // console.log("websocket "+socket.id+" connected");
            core.getSocketSession(socket, function(err, session) {
                if(!session || !session.i18n_user)
                    return socket.disconnect();

                // console.log(arguments);
                self.webSocketMap[socket.id] = socket;            
                socket.on('disconnect', function() {            
                    delete self.webSocketMap[socket.id];
                    // console.log("websocket "+socket.id+" disconnected");
                });

                socket.on('rpc::request', function(msg) {
                    try {
                        if(!msg.req) {

                            socket.emit('rpc::response', {
                                err : { error : "Malformed request" }
                            });

                        }
                        else {
                            /*
                            msg.req.user = self.userTracking[info.sid];
                            if(!self.authenticator)
                                msg.req.token = msg.req.user && msg.req.user.token;
                            */

                            var listeners = self.listeners(msg.req.op);
                            if(listeners.length == 1) {
                                listeners[0].call(socket, msg.req, function(err, resp) {
                                    socket.emit('rpc::response', {
                                        _resp : msg._req,
                                        err : err,
                                        resp : resp,
                                    });
                                })
                            }
                            else
                            if(listeners.length)
                            {
                                socket.emit('rpc::response', {
                                    _resp : msg._req,
                                    err : { error : "Too many handlers for '"+msg.req.op+"'" }
                                });
                            }
                            else
                            {
                                socket.emit('rpc::response', {
                                    _resp : msg._req,
                                    err : { error : "No such handler '"+msg.req.op+"'" }
                                });
                            }
                        }
                    }
                    catch(ex) { console.error(ex.stack); }
                });

                socket.on('message', function(msg, callback) {
                    try {                   
                        self.emit(msg.op, msg, socket);
                        self.dispatchToAll(msg, socket.id);
                    }
                    catch(ex) { console.error(ex.stack); }
                });
            })
        }); 
    })

    self.on('update', function(args, socket) {
        var entry = self.entries[args.hash];
        entry.locale[args.locale] = args.text;
        entry.multiline = args.multiline;
        self.storeEntries();
    });

    self.on('update-note', function(args, socket) {
        var entry = self.entries[args.hash];
        entry.note = args.note;
        self.storeEntries();
    });

    self.on('delete', function(args) {
        if (self.entries[args.hash]) {
            delete self.entries[args.hash];
            self.storeEntries();
            self.dispatchToAll({op: 'delete', hash: args.hash});
        }
    });

    self.on('locale-update', function(args, socket) {
        var l = self.config.languages[args.locale.ident];
        if (!l)
            return console.log('invalid local.ident', args.local.ident);

        l.enabled = !!args.locale.enabled;
        self.storeConfig();
        self.updateEnabled();
    });
    

    self.initHttp = function(app) {

        self.clientIPs = { }
        function reapIPs() {
            var ts = Date.now();
            var purge = [ ]
            _.each(self.clientIPs, function(info, ip) {
                if(info.ts + 10 * 60 * 1000 < ts)
                    purge.push(ip);
            })
            _.each(purge, function(ip) {
                delete self.clientIPs[ip];
            })

            dpc(60 * 1000, reapIPs);
        }
        reapIPs();

        app.use('/i18n/deps',core.express.static(path.join(__dirname, 'http/deps')));

        app.post('/i18n/login', function(req, res, next) {

            var ip = core.getClientIp(req);
            var ts = Date.now();
            var user = req.body.user;
            var sig = req.body.sig;
            var challenge = req.session.i18n_challenge;
            if(!user || !sig || !user.length || !sig.length || !challenge)
                return res.status(401).end();

            var info = self.clientIPs[ip];
            if(!info) {
                info = self.clientIPs[ip] = {
                    ts : ts,
                    hits : 0
                }
            }
            else {
                info.hits++;
            }

            var next = info.ts + info.hits * 1000;
            if(next > ts) {
                return res.status(200).json({ ack : "Too Many Attempts - Please wait "+((next-ts)/1000).toFixed()+" seconds before trying again.."});
            }
            else {
                info.ts = ts;
                user  = self.config.users[user];
                if(!user || !user.pass)
                    return res.status(401).end();

                var lsig = crypto.createHmac('sha256', new Buffer(challenge, 'hex')).update(new Buffer(user.pass, 'hex')).digest('hex');
                if(sig != lsig)
                    return res.status(401).end();

                req.session.i18n_user = user;
                return res.status(200).json({ ack : challenge });
            }
        })

        app.get('/i18n/login', function(req, res, next) {
            req.session.i18n_challenge = crypto.createHash('sha256').update(core.config.http.session.secret+Date.now()).digest('hex');
            ejs.renderFile(path.join(__dirname,'views/login.ejs'), { challenge : req.session.i18n_challenge }, function(err, html) {
                if(err) {
                    console.log(err.toString());
                    res.status(500).end(err.toString());
                }
                else {
                    res.end(html)
                }
            })
        })

        app.get('/i18n/logout', function(req, res, next) {
            req.session.i18n_user = null;
            res.redirect("/i18n/login");
        });

        app.get('/robots.txt', function(req, res) {
            res.end("Sitemap: "+req.protocol + '://' + req.headers.host+"/sitemap.xml");
        });

        app.get('/sitemap.xml', function (req, res, next) {
            var options = self.sitemapConfig;
            if (!options.baseUrl) {
                options.baseUrl = req.protocol + '://' + req.headers.host;
            }
            var xml = self.buildSitemap(options);
            res.contentType('text/xml');
            res.end(xml.join('\n'));
        });


        app.use('/i18n*', function(req, res, next) {
            if(!req.session.i18n_user)
                return res.redirect("/i18n/login");
            next();
        })

        app.get('/i18n/get', function(req, res) {
            res.json({
                config : self.config,
                entries : self.entries,
                locales : req.session.i18n_user.locales
            });
        })

        app.use('/i18n',core.express.static(path.join(__dirname, 'http')));

        app.get('/i18n', function(req, res, next) {
            ejs.renderFile(path.join(__dirname,'views/index.ejs'), { }, function(err, html) {
                if(err) {
                    console.log(err.toString());
                    res.status(500).end(err.toString());
                }
                else {
                    res.end(html)
                }
            })
        });

        app.use(function(req, res, next) {
            /*
            console.log(req.headers)
            if(req.session && !req.session.locale) {
                var header = req.header('accept-language');
                if(header) {
                    var parts = header.split(';');
                    if(parts && parts.length) {
                        var base = parts[0].split(',')[1];
                        if(base && self.config.languages[base]) {
                            req.session.locale = base;
                        }
                    }
                }
            }
            */

            var parts = req.url.split('/');
            parts.shift();
            var lang = parts.shift();
            if(!lang)
                return next();

            if(self.config.language_aliases[lang])
                lang = self.config.language_aliases[lang];

            var l = self.config.languages[lang];
            if(!l) 
                return next();

            if(lang == self.config.sourceLanguage)
                return res.redirect('/'+parts.join('/'));

            if(!l.enabled)
                lang = self.config.sourceLanguage;

            if(l && !parts.length)
                return res.redirect('/'+lang+'/');


            if(l) {
                req._i18n_locale = lang;
                req.url = '/'+parts.join('/') || '/';
            }

            next();
        })

        app.use(function(req, res, next) {
            req._T = function (text, loc) {
                loc = loc || req._i18n_locale;
                return self.translate(text, loc);
            };

            req._T.locale = req._i18n_locale || self.config.sourceLanguage;
            req._T.languages = self.enabledLanguages;
            req._T.source = self.config.sourceLanguage;
            res.locals._T = req._T;

            next();            
        })
    }

    self.translate = function(text, locale, params, category) {

        var hash = self.hash(text);
        var entry = self.entries[hash];
        if(entry) {
            entry.orphan = false;
            text = entry.locale[locale] || text;
        }
        else {
            var file = '';
            try{
                Error.prepareStackTrace =  function(error, r){
                    _.each(r, function(e){
                        var fnBody = e.getFunction().toString();
                        if(fnBody.indexOf('_T("'+text+'")')>-1 || fnBody.indexOf("_T('"+text+"')")>-1){
                            file = e.getFileName();
                        }
                        //console.log(e.getFileName() , e.getMethodName(),  e.getFunctionName() );
                    });
                }
                new Error().stack;
                if(file){
                    file = self.getRelativePath(file);
                }
            } catch(e) {
                //console.log(e)
            }

            self.createEntry(text, category, file) && self.storeEntries();
        }

        if(params) {
            text = text.strtr(params);
        }

        return text;
    }

    self.createEntry = function (text, category, _file) {
        var hash = self.hash(text);
        var file = _file? _file.replace(/\\/g,'/') : '';

        if (!self.entries[hash]) {
            var locale = { }
            locale[self.config.sourceLanguage] = text;
            //if(self.secondaryLanguage){
            //    locale[self.secondaryLanguage] = self.secondaryLanguageTpl.replace('{text}', text);
            //}

            var category = category ? category : self.basicCategory;

            var files = file ? [file.replace(core.appFolder, '')] : [];

            self.entries[hash] = {
                hash: hash,
                sha1 : crypto.createHash('sha1').update(text).digest('hex'),
                category: category,
                locale: locale,
                original: self.config.sourceLanguage,
                files: files,
                multiline: false,
                orphan: false,
                ts : Date.now()
            };

            self.config.debug && console.log('i18n: Creating new entry:', '"'+text+'"');
            self.flush = true;
            return true;
        } 
        else 
        {
            var entry = self.entries[hash];
            entry.orphan = false;
            file = file.replace(core.appFolder, '');
            if (file && !_.contains(entry.files, file)) {
                entry.files.push(file);
                self.flush = true;
                return true;
            }
        }

        return false;
    }

    // -------------

    function scanFolders(rootFolderPath, folders, folderFileExtensions, callback) {
        var result = [];

        self.config.debug && console.log('Scanning:: Folders', folders);
        self.config.debug && console.log('Scanning:: Root folder path', rootFolderPath);
        var fileExtensions = self.config.files.slice();
        scanFolder();

        function scanFolder() {
            var folder = folders.shift();
            if (folder === undefined) {
                //                console.log('Scanning:: Finished with result', result);
                return callback(null, result);
            }
            if(folderFileExtensions.length){
                fileExtensions = folderFileExtensions.shift();
            }
            //var path = rootFolderPath + '/' + folder;
            var scanPath = path.join(rootFolderPath,folder);

            self.config.debug && console.log('Scanning:: Full path to folder', scanPath, fileExtensions);

            fs.readdir(scanPath, function (err, list) {
                if (err) {
                    console.error("Error scanning folder: ", scanPath);
                    return scanFolder();
                }

                var files = [];

                for (var i = 0; i < list.length; i++) {
                    if (acceptFile(scanPath, list[i], fileExtensions)) {
                        //files.push((folder.length ? folder + '/' : folder) + list[i]);
                        //files.push(path.join(scanPath,list[i]));
                        files.push(path.join(folder,list[i]));
                    }
                }

                result = result.concat(files);

                scanFolder();
            });
        }
    }

    function acceptFile(scanPath, relative, fileExtensions) {
        if (!relative || !relative.length) return false;
        if (relative.charAt(0) == '.') return false;
        if (fs.statSync(scanPath + '/' + relative).isDirectory())
            return false;
        var ext = relative.split('.').pop();
        if (_.contains(fileExtensions, ext))
            return true;
        return false;
    }

    function digestFiles(files, callback) {
        digest();
        function digest() {
            var file = files.shift();
            if (!file) return callback();
            digestFile(file.replace('\\','/'), function (err) {
                if (err) return callback(err);
                digest();
            });
        }
    }

    function digestFile(file, callback) {
        fs.readFile(file, {encoding: 'utf8'}, function (err, data) {
            if (err) {
                console.log(err, file);
                return callback(null);
            }

            data = data.toString('utf8');

            var matches = [];

            // syntax _T("It's wonderful life")
            matches = matches.concat(data.match(/_T\(\"[^\"]+\"\)/gi));
            matches = matches.concat(data.match(/_T\(\'[^\']+\'\)/gi));

            _.each(matches, function (match) {
                if (match) {
                    self.createEntry(match.substring(4, match.length - 2), '', file);
                }
            });

            var matches = [];

            // syntax 'Hello world'._T()
            matches = matches.concat(data.match(/\'[^\']+\'._T/gi));
            matches = matches.concat(data.match(/\"[^\"]+\"._T/gi));

            _.each(matches, function (match) {
                if (match) {
                    self.createEntry(match.substring(1, match.length - 4), '', file);
                }
            });

            callback();
        })
    }

    if(!self.config.hash || self.config.hash == 'fast') {
        self.hash = function(str) {
            var A = 5381,
                B = 9835,
                i    = str.length;
            while(i) {
                var ch = str.charCodeAt(--i);
                A = (A * 33) ^ ch;
                B = (B * 55) ^ ch ^ A;
            }
            A = A >= 0 ? A : (A & 0x7FFFFFFF) + 0x80000000;
            B = B >= 0 ? B : (B & 0x7FFFFFFF) + 0x80000000;
            return A.toString(16)+B.toString(16);
        }
    }
    else {
        self.hash = function(str) {
            return crypto.createHash(self.config.hash).update(str).digest('hex');
        }        
    }

    scanFolders(core.appFolder, self.config.folders.slice(), [] , function (err, files) {
        if (err) return callback(err, self.entries);

        digestFiles(files, function (err) {
            if(self.flush) {
                self.flush = false;
                self.storeEntries();
            }
        });
    });


     /**
     *
     * Options:
     *  {
     *    baseUrl: 'example.com',
     *    displayDefaultLocale: true,
     *    data: [
     *        {
     *            url: '',
     *            changefreq: 'monthly',
     *            priority: 1
     *        },
     *        {url: 'user'},
     *        {url: 'profile'}
     *    ]
     *  }
     *
     * @param options
     * @returns {Function}
     */
    self.buildSitemap = function(options){
        var data                    = options.data || {};
        var baseUrl                 = options.baseUrl;
        var defaultLanguage         = options.defaultLanguage || core.defaultLanguage || 'en';
        var xml = ['<?xml version="1.0" encoding="UTF-8"?>',
                    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">'];

        _.each(data, function (row) {
            xml.push('<url>');
            var url = row.url ? '/' + row.url : '';
            xml.push('<loc>' + baseUrl + url  + '</loc>');

            _.each(self.enabledLanguages, function(l2, target) {
                if(target != defaultLanguage)
                    xml.push('<xhtml:link rel="alternate" hreflang="'+ target +'" href="'+baseUrl + '/' + target + url +'" />');
            });

            if (row.lastmod) {
                xml.push('<lastmod>' + row.lastmod + '</lastmod>');
            }
            if (row.changefreq) {
                xml.push('<changefreq>' + row.changefreq + '</changefreq>');
            }
            if (row.priority) {
                xml.push('<priority>' + row.priority + '</priority>');
            }

            xml.push('</url>');
        });

        xml.push('</urlset>');

        return xml;
    }
}

util.inherits(i18n, events.EventEmitter);

module.exports = i18n;
