/*
 * Bedrock webpack Module
 *
 * Copyright (c) 2017-2018 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const bedrock = require('bedrock');
const {callbackify} = bedrock.util;
const config = bedrock.config;
const fs = require('fs');
const filesize = require('file-size');
const path = require('path');
const util = require('util');
const webpack = require('webpack');
const webpackMerge = require('webpack-merge');
const StatsPlugin = require('stats-webpack-plugin');
const UglifyJsPlugin = require('uglifyjs-webpack-plugin');
const BedrockError = bedrock.util.BedrockError;

// load config defaults
require('./config');

// module API
const api = {};
module.exports = api;

const logger = bedrock.loggers.get('app').child('bedrock-webpack');
const NODE_MODULES_DIR = path.resolve(__dirname, '../../../node_modules');

// options always available
function _configureBundleCli(command) {
  return command
    .option('--webpack-mode <mode>',
      'Use webpack mode (development, production) [development]',
      /^(development|production)$/i, 'development')
    .option('--webpack-uglify <mode>',
      'Use webpack uglifyjs plugin (true, false) [true]',
      /^(true|false)$/i, 'true')
    .option('--webpack-uglify-mangle <mode>',
      'webpack uglifyjs mangle mode (true, false) [true]',
      /^(true|false)$/i, 'true')
    .option('--webpack-uglify-beautify <mode>',
      'webpack uglifyjs beautify mode (true, false) [false]',
      /^(true|false)$/i, 'false')
    .option('--webpack-uglify-comments <mode>',
      'webpack uglifyjs keep comments (true, false) [false]',
      /^(true|all|some|false|)$/i, 'some')
    .option('--webpack-profile <mode>',
      'webpack profile mode (true, false) [false]',
      /^(true|false)$/i, 'false')
    .option('--webpack-stats <mode>',
      'webpack stats generation mode (true, false) [false]',
      /^(true|false)$/i, 'false')
    .option('--webpack-log-config <mode>',
      'log webpack config (true, false) [false]',
      /^(true|false)$/i, 'false');
}

// options only for optimize mode
function _configureOptimizeCli(command) {
  // FIXME: use only some options here?
  return command;
}

// configure for the all bundle actions (such as "watch")
bedrock.events.on('bedrock-views.cli.bundle.configure',
  command => _configureBundleCli(command));

// configure for the "optimize" command
bedrock.events.on('bedrock-views.cli.optimize.configure',
  command => _configureOptimizeCli(command));

async function _bundle(options) {
  const output = options.output || config['bedrock-webpack'].out;
  const paths = options.paths || config['bedrock-webpack'].paths;
  const overrideConfigs = await _buildOverrideConfigs(options);

  await api.bundle({
    main: options.input,
    output,
    paths,
    configs: [
      ...overrideConfigs,
      // FIXME: this should be a param
      {
        resolve: {
          modules: [
            path.dirname(bedrock.config.views.system.paths.importAll)
          ],
          symlinks: false
        }
      }
    ],
    optimize: options.optimize,
    watch: options.watch
  });
}

bedrock.events.on('bedrock-views.bundle.run', callbackify(options => {
  return _bundle(options);
}));

/**
 * Bundle the main entry points using webpack into a single file.
 *
 * @param [options] the options to use.
 *          [main] a string or array of entry points
 *          [output] filename to output
 *          [paths] paths for output (local and public)
 *          [configs] an array of webpack configs to merge
 *          [optimize] true to optimize
 *          [watch] true to watch for changes
 * FIXME
 * @param callback(err) called once the operation completes.
 */
api.bundle = callbackify(async function(options = {}) {
  if(!('main' in options)) {
    throw new BedrockError(
      'webpack optimize missing main entry point',
      'WebpackError');
  }

  options.configs = options.configs || [];
  const paths = Object.assign({
    local: path.dirname(options.output),
    publicPath: '/'
  }, options.paths || {});

  // FIXME: if optimize has specific options, need cli command
  //const command = bedrock.config.cli.command;
  const command = bedrock.program;
  const entry = [
    ...config['bedrock-webpack'].baseEntry,
    ...options.main
  ];

  let webpackMode = command.webpackMode;
  // FIXME
  // override in minify mode
  if(options.optimize || bedrock.program.minify === 'true') {
    webpackMode = 'production';
  }

  logger.info('bundling', {
    entry,
    output: options.output,
    mode: webpackMode
  });

  if(!paths.public.endsWith('/')) {
    paths.public += '/';
  }

  const baseConfig = {
    context: path.resolve(__dirname, '../../..'),
    mode: webpackMode,
    entry: {
      main: entry
    },
    output: {
      path: paths.local,
      publicPath: paths.public,
      filename: path.basename(options.output)
    },
    resolve: {
      modules: [
        // top level node_modules dir
        // FIXME: get this via location independent method
        NODE_MODULES_DIR
      ],
      alias: {
        // often will need an alias in each projects config like:
        // 'my-project': path.resolve(__dirname, '../components')
      }
    },
    module: {
      rules: [
        {
          test: /\.js$/,
          // common modules to exclude from processing
          exclude: [
            /node_modules\/angular\//,
            /node_modules\/angular-material\//,
            /node_modules\/jsonld\/dist\//,
            /node_modules\/localforage\//,
            /node_modules\/lodash\//,
            /node_modules\/quasar\/dist\//
          ],
          use: {
            loader: require.resolve('babel-loader'),
            options: {
              presets: [
                // normal mode
                require.resolve('babel-preset-env')
                // debug mode
                //[require.resolve('babel-preset-env'), { debug: true }]
              ],
              plugins: [
                require.resolve('babel-plugin-angularjs-annotate'),
                require.resolve('babel-plugin-syntax-dynamic-import'),
                [
                  require.resolve('babel-plugin-transform-object-rest-spread'),
                  {useBuiltIns: true}
                ]
              ]
            }
          }
        },
        {
          test: /\.less$/,
          use: [
            require.resolve('vue-style-loader'),
            require.resolve('css-loader'),
            require.resolve('less-loader')
          ]
        },
        {
          test: /\.scss$/,
          use: [
            require.resolve('vue-style-loader'),
            require.resolve('css-loader'),
            {
              loader: require.resolve('sass-loader')
            }
          ]
        },
        {
          test: /\.styl(us)?$/,
          use: [
            require.resolve('vue-style-loader'),
            require.resolve('css-loader'),
            require.resolve('stylus-loader')
          ]
        },
        {
          test: /\.vue$/,
          use: {
            loader: require.resolve('vue-loader'),
            options: {
              hotReload: false,
              cssSourceMap: false,
              loaders: {
                js: [
                  {
                    loader: require.resolve('babel-loader'),
                    options: {
                      presets: [
                        // normal mode
                        require.resolve('babel-preset-env')
                      ],
                      plugins: [
                        require.resolve('babel-plugin-syntax-dynamic-import'),
                        [
                          require.resolve(
                            'babel-plugin-transform-object-rest-spread'),
                          {useBuiltIns: true}
                        ]
                      ]
                    }
                  }
                ],
                css: require.resolve('vue-style-loader') + '!' +
                  require.resolve('css-loader'),
                less: require.resolve('vue-style-loader') + '!' +
                  require.resolve('css-loader') + '!' +
                  require.resolve('less-loader'),
                scss: require.resolve('vue-style-loader') + '!' +
                  require.resolve('css-loader') + '!' +
                  require.resolve('sass-loader'),
                styl: require.resolve('vue-style-loader') + '!' +
                  require.resolve('css-loader') + '!' +
                  require.resolve('stylus-loader'),
                stylus: require.resolve('vue-style-loader') + '!' +
                  require.resolve('css-loader') + '!' +
                  require.resolve('stylus-loader')
              }
            }
          }
        }
      ]
    },
    plugins: [
      new webpack.DefinePlugin({
        // FIXME: use mode flag?
        'process.env.NODE_ENV': '"production"',
        'process.env.DEBUG': '"false"',
        'process.env.BUILD': '"web"'
      })
    ],
    profile: command.webpackProfile === 'true',
    node: {
      // FIXME these disable polyfills globally
      'base64-js': false,
      Buffer: false,
      crypto: false,
      ieee754: false,
      process: false,
      setImmediate: false
    }
  };

  if(command.webpackUglify === 'true') {
    const comments = {
      'true': true,
      'all': 'all',
      'some': 'some',
      'false': false
    }[command.webpackUglifyComments];
    const uglifyOptions = {
      mangle: command.webpackUglifyMangle === 'true',
      output: {
        beautify: command.webpackUglifyBeautify === 'true',
        comments
      }
    };
    baseConfig.optimization = {
      minimizer: [
        new UglifyJsPlugin({uglifyOptions})
      ],
      minimize: true
    };
  }

  if(command.webpackStats === 'true') {
    baseConfig.plugins.push(new StatsPlugin('webpack-stats.json', {
      chunkModules: true
    }));
  }

  const webpackConfig = webpackMerge(
    baseConfig, ...options.configs, ...config['bedrock-webpack'].configs);
  // FIXME: add support to output the config? (difficult due to plugins and regexes)
  //fs.writeFileSync('/tmp/webpack.config.js', 'module.exports = ' + JSON.stringify(config, null, 2));
  if(command.webpackLogConfig === 'true') {
    //logger.info('config', {config: webpackConfig});
    console.log('config', util.inspect(webpackConfig, {
      depth: null, colors: true
    }));
  }
  let buildCount = 0;
  function webpackDone(err, {msg, stats}) {
    buildCount++;
    if(err) {
      logger.error('error', err.stack || err);
      if(err.details) {
        logger.error('error details', err.details);
      }
      return err;
    }

    const info = stats.toJson();

    if(stats.hasErrors()) {
      const s = info.errors.toString();
      logger.error(`errors:\n${s}\n`);
      err = new BedrockError(
        'webpack error',
        'WebpackError', {
          'errors': info.errors
        });
    }

    if(stats.hasWarnings()) {
      const s = info.warnings.toString();
      logger.warning(`warnings:\n${s}\n`);
    }

    // FIXME: log/save important parts of stats/info
    // FIXME: add new option to control this output
    // reuse stats option
    if(command.webpackStats === 'true') {
      const s = stats.toString({
        chunks: false,
        colors: true
      });
      logger.info(`stats:\n${s}\n`);
    }

    const timeMs = stats.endTime - stats.startTime;
    const size = fs.statSync(options.output).size;
    const sizeStr = filesize(size).human();
    logger.info(`${msg} complete (${sizeStr})`, {
      timeMs, size, output: options.output, buildCount
    });

    return err;
  }

  // watch or single-run
  if(options.watch) {
    logger.info('watch starting');
    const compiler = webpack(webpackConfig);
    compiler.hooks.watchRun.tap('bedrock-webpack', () => {
      logger.info('watch triggered');
    });
    compiler.watch({}, (err, stats) => {
      webpackDone(err, {msg: 'watch', stats});
      // FIXME: additional error handling?
    });
    // watch in background and resolve immediately
    return;
  } else {
    logger.info('bundling starting');
    let _resolve;
    let _reject;
    const p = new Promise((resolve, reject) => {
      _resolve = resolve;
      _reject = reject;
    });
    webpack(webpackConfig, (err, stats) => {
      const _err = webpackDone(err, {msg: 'bundling', stats});
      if(_err) {
        _reject(_err);
        return;
      }
      _resolve();
    });
    return p;
  }
});

// build webpack config overrides from pseudo packages
async function _buildOverrideConfigs({pkgs = {}}) {
  const readFile = util.promisify(fs.readFile);
  const configs = [];
  const sysPckgs = bedrock.config.views.system.packages.map(async pkg => {
    const data = await readFile(pkg.manifest);
    const manifest = JSON.parse(data);
    configs.push({
      resolve: {
        alias: {
          [manifest.name]: pkg.path
        }
      }
    });
  });
  await Promise.all(sysPckgs);

  // create a list of packages that contain the webpack override
  const webpackOverridesManifests = Object.keys(pkgs)
    .map(key => pkgs[key].manifest)
    .filter(manifest => manifest.bedrock && manifest.bedrock.webpack);
  webpackOverridesManifests.map(({bedrock}) => {
    const {webpack} = bedrock;
    Object.keys(webpack).forEach(pkgName => {
      // if the override contains manifest.webpack.resolve.alias
      const config = webpack[pkgName];
      if(config) {
        configs.push(config);
      }

      if((config.resolve || {}).alias) {
        // specially resolve alias paths to full path
        Object.keys(config.resolve.alias).forEach(alias => {
          // TODO: check to see if we can get `path` from the pseudo package
          // so we don't need to recompute here or assume top-level modules

          // resolve the relative path within a package to an absolute path
          const aliasPath = path.resolve(
            NODE_MODULES_DIR,
            pkgName,
            webpack[pkgName].resolve.alias[alias]);
          config.resolve.alias[alias] = aliasPath;
        });
      }
    });
  });

  return configs;
}
