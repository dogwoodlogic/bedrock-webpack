/*
 * Bedrock webpack Module
 *
 * Copyright (c) 2017 Digital Bazaar, Inc. All rights reserved.
 */
const bedrock = require('bedrock');
const requirejs = require('webpack');

// load config defaults
require('bedrock-docs');
require('bedrock-express');
require('./config');

// module API
const api = {};
module.exports = api;

const logger = bedrock.loggers.get('app');
