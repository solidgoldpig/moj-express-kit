'use strict'

let get = require('lodash/get')
let set = require('lodash/set')
let cloneDeep = require('lodash/cloneDeep')
let fs = require('fs')
let os = require('os')
let path = require('path')

const dataDir = process.cwd()

let jsonSrc = path.join(dataDir, 'metadata/blocks.json')

let blocks
let blocksSrc = require(jsonSrc)

function stringify (obj) {
  return JSON.stringify(obj, null, 2)
}

function sortObject (obj) {
  var sortedObj = {}
  Object.keys(obj)
    .sort()
    .forEach(key => {
      sortedObj[key] = obj[key]
      if (typeof sortedObj[key] === 'object' && !Array.isArray(sortedObj[key])) {
        sortedObj[key] = sortObject(sortedObj[key])
      }
    })
  return sortedObj
}
function save () {
  blocksSrc = sortObject(blocksSrc)
  return new Promise((resolve, reject) => {
    fs.writeFile(jsonSrc, stringify(blocksSrc), err => {
      if (err) {
        reject(err)
      } else {
        resolve(blocksSrc)
      }
    })
  })
}
function processBlocks () {
  blocks = cloneDeep(blocksSrc)
  let processedBlocks = {}
  function extendBlock (key) {
    let block = blocks[key]
    if (block._isa) {
      let extendedKey = block._isa
      let extendedBlock = blocks[extendedKey]
      if (extendedBlock._isa && !processedBlocks[extendedKey]) {
        extendBlock(extendedKey)
        extendedBlock = blocks[extendedKey]
      }
      block = Object.assign({}, extendedBlock, block)
      // delete block.extends
      blocks[key] = block
      processedBlocks[key] = true
    }
  }
  Object.keys(blocks).forEach(key => {
    extendBlock(key)
  })
  Object.keys(blocks).forEach(key => {
    let block = blocks[key]
    Object.keys(block).forEach(prop => {
      if (prop.match(/^\*/)) {
        let keyToAlias = prop.replace(/^\*/, '')
        if (block[keyToAlias] === undefined) {
          block[keyToAlias] = block[block[prop]]
        }
      } else if (prop.match(/^=/)) {
        let keyToAlias = prop.replace(/^=/, '')
        if (block[keyToAlias] === undefined) {
          let aliasedProp = block[prop]
          let aliasedKeyProp = keyToAlias
          if (aliasedProp.indexOf('=') !== -1) {
            let aliasChunks = aliasedProp.split('=')
            aliasedProp = aliasChunks[0]
            aliasedKeyProp = aliasChunks[1]
          }
          let aliasedPropValue = blocks[aliasedProp][aliasedKeyProp]
          if (Array.isArray(aliasedPropValue)) {
            aliasedPropValue = aliasedPropValue.slice()
          }
          block[keyToAlias] = aliasedPropValue
        }
      }
    })
    // let blocksAlias = blocks[key].blocks_alias
    // if (blocksAlias) {
    //   let aliasedBlocks = blocks[blocksAlias].blocks
    //   blocks[key].blocks = aliasedBlocks.slice()
    // }
  })
  Object.keys(blocks).forEach(key => {
    let keyBlock = blocks[key]
    let overrideKey = 'override--' + key
    let overrideBlock = {
      label: keyBlock.label || keyBlock.heading || keyBlock.title
    }
    if (keyBlock.blocks) {
      let keySubblock = 'override--subblock--' + key
      let dependObj = {}
      dependObj['!' + overrideKey] = 'hide'
      blocks[keySubblock] = {
        type: 'group',
        blocks: keyBlock.blocks.map(function (el) {
          return 'override--' + el
        }),
        depends: [dependObj]
      }
      overrideBlock.subblock = keySubblock
    }
    blocks[overrideKey] = Object.assign({}, blocks['default:overrides-show-hide'], overrideBlock)
  })
}
processBlocks()

function getValue (path, defaultValue) {
  return get(blocks, path, defaultValue)
}

function getRawValue (path, defaultValue) {
  return get(blocksSrc, path, defaultValue)
}

function setValue (objPath, value) {
  set(blocksSrc, objPath, value)
  processBlocks()
  let tmpPath = path.resolve(os.tmpdir(), 'blocks-backup.json')
  console.log(`Saved tmp file to ${tmpPath}`)
  fs.writeFile(tmpPath, stringify(blocksSrc), () => {})
  if (true || process.env.AUTOSAVE) {
    console.log('Autosaving blocks')
    save()
  }
  return true
}

function getBlockTypes () {
  let seen = {}
  let keys = Object.keys(blocksSrc).map(key => {
    return blocksSrc[key]._blockType
  }).filter(type => {
    let seenit = seen[type]
    seen[type] = true
    return !seenit
  })
  return keys.sort()
}
function getKeys (type) {
  let keys = Object.keys(blocksSrc)
  if (type) {
    keys = keys.filter(key => {
      return blocksSrc[key]._blockType === type
    })
  }
  return keys // .sort()
}
function getAll (type, value) {
  let keys = Object.keys(blocksSrc)
  if (type) {
    keys = keys.filter(key => {
      return blocksSrc[key][type] === value
    })
  }
  return keys
}

// function xgetAll (type, value) {
//   return Object.keys(blocksSrc)
//     .filter(function (key) {
//       return blocksSrc[key][type] === value
//     })
//     .map(function (key) {
//       return Object.assign({key: key}, blocksSrc[key])
//     })
// }

module.exports = {
  blocksSrc,
  blocks,
  get: getValue,
  set: setValue,
  getRaw: getRawValue,
  getAll,
  getKeys,
  getBlockTypes,
  save
}
