const glob = require('glob-promise')
const path = require('path')
const fs = require('fs')

const jsonlint = require('jsonlint')

const appDir = process.cwd()

const errors = []
const reportError = msg => {
  errors.push(msg)
}

const testJSON = (file, options={}) => {
  return new Promise((resolve, reject) => {
    fs.readFile(file, {encoding: 'utf8'}, (err, jsonContent) => {
      try {
        jsonlint.parse(jsonContent)
        if (options._id) {
          const json = JSON.parse(jsonContent)
          if (json._id !== file.replace(/.*\/([^/]+)\.json$/, '$1')) {
            reportError([`Non-matching _id - ${file}`, `_id (${json._id}) does not match source filename`].join('\n'))
          }
        }
      } catch (e) {
        reportError([`Invalid json file - ${file}`, e.toString()].join('\n'))
      }
      resolve()
    })
  })
}

const testJSONFiles = (files, options) => Promise.all(files.map(file => testJSON(file, options)))

glob(`${appDir}/metadata/blocks/**/*.json`)
.then(files => testJSONFiles(files, {_id: true}))
.then(() => {
  return glob(`${appDir}/metadata/*.json`)
    .then(testJSONFiles)
})
.then(() => {
  if (errors.length) {
    console.log(errors.join('\n\n'))
    process.exit(1)
  }
})

// env APPDIR=$PWD npm explore moj-express-kit -- yarn lint:data
// find $APPDIR/metadata/**/*.json | xargs -P 20 -L 1 jsonlint -q