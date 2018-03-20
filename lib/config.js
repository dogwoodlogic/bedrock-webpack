/*
 * Bedrock webpack Module Configuration
 *
 * Copyright (c) 2017-2018 Digital Bazaar, Inc. All rights reserved.
 */
const bedrock = require('bedrock');
const cc = bedrock.util.config.main.computer();
const config = bedrock.config;
const path = require('path');

config['bedrock-webpack'] = {};

// configs to be merged with webpack-merge into the base config
config['bedrock-webpack'].configs = [];

// default main output file location
cc('bedrock-webpack.out', () => path.join(
  config.paths.cache, 'bedrock-webpack', 'main.min.js'));
