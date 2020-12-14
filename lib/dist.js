var os = require('os'),
  path = require('path'),
  fs = require('fs-extended'),
  request = require('request'),
  AdmZip = require('adm-zip'),
  _ = require('underscore'),
  config = require('./config');

if (typeof os.tmpDir != 'function') {
  os.tmpDir = os.tmpdir;
}

exports.isInstalled = function (cmp, dst, o) {

  if (cmp.type === 'widget') {

    // installed if target exists and version matches
    return fs.existsSync(path.join(dst.trgPath, 'widget.json')) && require(path.join(dst.trgPath, 'widget.json')).version >= dst.version;

  } else {

    return _.reduce(dst.platforms, function (memo, platform) {

      // ios modules are stored under iphone
      if (platform === 'ios') {
        platform = 'iphone';
      }

      var available = config.available_modules,
        scope = config.context;

      // installed if module of specified version is found in context
      if (memo && available[scope] && available[scope][platform] && available[scope][platform][cmp.id]) {

        // iterate through versions, check if there's a later one installed
        for (var version in available[scope][platform][cmp.id]) {
          if (version >= dst.version) {
            return true;
          }
        }
      }
    }, true);
  }
};

exports.download = function (zipUrl, _cb) {
  var tmpFile = path.join(generateTempDir() + '.zip');

  request.get(zipUrl).pipe(fs.createWriteStream(tmpFile)).on('close', function () {

    exports.extract(tmpFile, function (err, unzipDir) {

      if (err) {
        return _cb(err);
      }

      _cb(null, unzipDir);
    });
  });
};

function generateTempDir() {
  return path.join(os.tmpDir(), Date.now().toString() + '-' + Math.random().toString().substring(2));
}

exports.extract = function (zipFile, _cb) {
  var tmpDir = generateTempDir();

  try {
    var zip = new AdmZip(zipFile),
      entries = zip.getEntries(),
      pending = entries.length;

    entries.forEach(function (entry) {

      if (entry.isDirectory) {
        return;
      }

      var file = path.join(tmpDir, entry.entryName);
      fs.createFileSync(file, entry.getData());
    });

    _cb(null, tmpDir);

  } catch (err) {
    _cb(err);
  }
};
