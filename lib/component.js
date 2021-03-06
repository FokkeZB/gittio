var os = require('os'),
  path = require('path'),
  logger = require('./logger'),
  request = require('request'),
  semver = require('semver'),
  _ = require('underscore'),
  utils = require('./utils'),
  config = require('./config');

exports.lookup = function(id, callback, options) {
  options = options || {};
  var prefix = utils.prefix(id);

  if (!options.silent) {
    logger.info(prefix + ' searching...');
  }

  var url = config['registry.url'] + id;

  if (options.action) {
    url += '?action=' + options.action;
  }

  request(url, function(error, response, body) {

    if (!error && response.statusCode == 200) {
      var cmp = JSON.parse(body);

      if (cmp.error) {
        callback(prefix + ' ' + cmp.error, null);
        return;
      }

      // prepare for new types to be added
      if (cmp.type !== 'widget' && cmp.type !== 'module') {
        callback(prefix + ' unsupported type: ' + cmp.type);
        return;
      }

      callback(null, cmp);

    } else {
      callback(prefix + ' error contacting registry: ' + url, null);
    }
  });
};

exports.filterDists = function(cmp, o) {
  var platforms, dists = [];

  // split platforms given
  if (o.platform) {
    platforms = o.platform.split(',');

    // use deploymentTargets found in tiapp.xml
  } else if (config.targets && _.size(config.targets) > 0) {
    platforms = _.clone(config.targets);

    // install all platforms available
  } else {
    platforms = _.clone(cmp.platforms);
  }

  var addedCommonJS = false;

  // always include commonjs
  if (!_.contains(platforms, 'commonjs')) {
    addedCommonJS = true;
    platforms.unshift('commonjs');
  }

  var platform;

  // valid **specific** version, valid range, or something else (tags?)
  var targetVersion = semver.valid(o.version) || semver.validRange(o.version) || o.version;

  var versions = cmp.versions.map(function (v) {
    v.semver = semver.valid(v.version) || semver.valid(v.version + '.0') || null;
    return v;
  }).sort(looseCompareDists);

  var matches;

  // while we have platforms to cover
  while ((platform = platforms.shift()) !== undefined) {

    // filter for versions that..
    matches = versions.filter(function (v) {
      // have a dist and matches platform
      return v.dist && _.contains(v.platforms, platform);
    });

    var version;

    if (!targetVersion) {
      version = matches.pop();

    } else {
      while ((version = matches.pop()) !== undefined) {
        if (version.semver !== null ? semver.satisfies(version.semver, targetVersion) : (version.version === targetVersion)) {
          break;
        }
      }
    }

    var prefix = utils.prefix(cmp.id, o.version, platform);

    // specific version not found
    if (!version && o.version) {

      // don't error on the commonjs we added
      if (platform !== 'commonjs' || !addedCommonJS) {
        logger.error(prefix + ' not found');
      }

      continue;
    }

    // no distributable version found
    if (!version || !version.dist) {
      logger.error(prefix + ' no distributable available');
      continue;
    }

    // init paths
    if (cmp.type == 'widget') {
      version.trgPath = path.join(config.widgets_path, cmp.id);

      if (version.path.length > 0) {
        version.srcPath = path.join(cmp.repo + "-" + version.tree, version.path);
      } else {
        version.srcPath = path.join(cmp.repo + "-" + version.tree);
      }

    } else {
      version.trgPath = o.global ? config.global_modules_path : config.modules_path;
      version.srcPath = 'modules';
    }

    // remove the platforms this dist covers from our wanted-list
    platforms = _.difference(platforms, version.platforms);

    dists.push(version);

    // for widgets we only do one
    if (cmp.type === 'widget') {
      break;
    }
  }

  return dists;
};

function looseCompareDists(a, b) {

  // 'master' is to be considered the 'last resort' version
  if (a.version === 'master') {
    return -1;
  }
  else if (b.version === 'master') {
    return +1;
  }

  if (a.semver && b.semver) {
    return semver.compareLoose(a.semver, b.semver);

  } else {
    return _cmpVersion(a.version, b.version);
  }
}

function _cmpVersion(a, b) {
    var i, cmp, len, re = /(\.0)+[^\.]*$/;
    a = (a + '').replace(re, '').split('.');
    b = (b + '').replace(re, '').split('.');
    len = Math.min(a.length, b.length);
    for( i = 0; i < len; i++ ) {
        cmp = parseInt(a[i], 10) - parseInt(b[i], 10);
        if( cmp !== 0 ) {
            return cmp;
        }
    }
    return a.length - b.length;
}
