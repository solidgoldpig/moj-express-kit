#!/usr/bin/env node
const linter = require('./lint-javascript')

const paths = ['lib/**/*.js', 'lint/**/*.js']

linter({
  paths
})
