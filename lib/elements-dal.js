'use strict'

let get = require('lodash/get')
let set = require('lodash/set')
let cloneDeep = require('lodash/cloneDeep')
let fs = require('fs')
let os = require('os')
let path = require('path')

const dataDir = process.cwd()

let jsonSrc = path.join(dataDir, 'metadata/elements.json')

let elements
let elementsSrc = require(jsonSrc)

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
  elementsSrc = sortObject(elementsSrc)
  return new Promise((resolve, reject) => {
    fs.writeFile(jsonSrc, stringify(elementsSrc), err => {
      if (err) {
        reject(err)
      } else {
        resolve(elementsSrc)
      }
    })
  })
}
function processElements () {
  elements = cloneDeep(elementsSrc)
  let processedElements = {}
  function extendElement (key) {
    let element = elements[key]
    if (element.isa) {
      let extendedKey = element.isa
      let extendedElement = elements[extendedKey]
      if (extendedElement.isa && !processedElements[extendedKey]) {
        extendElement(extendedKey)
        extendedElement = elements[extendedKey]
      }
      element = Object.assign({}, extendedElement, element)
      // delete element.extends
      elements[key] = element
      processedElements[key] = true
    }
  }
  Object.keys(elements).forEach(key => {
    extendElement(key)
  })
  Object.keys(elements).forEach(key => {
    let element = elements[key]
    Object.keys(element).forEach(prop => {
      if (prop.match(/^\*/)) {
        let keyToAlias = prop.replace(/^\*/, '')
        if (element[keyToAlias] === undefined) {
          element[keyToAlias] = element[element[prop]]
        }
      } else if (prop.match(/^=/)) {
        let keyToAlias = prop.replace(/^=/, '')
        if (element[keyToAlias] === undefined) {
          let aliasedProp = element[prop]
          let aliasedKeyProp = keyToAlias
          if (aliasedProp.indexOf('=') !== -1) {
            let aliasChunks = aliasedProp.split('=')
            aliasedProp = aliasChunks[0]
            aliasedKeyProp = aliasChunks[1]
          }
          let aliasedPropValue = elements[aliasedProp][aliasedKeyProp]
          if (Array.isArray(aliasedPropValue)) {
            aliasedPropValue = aliasedPropValue.slice()
          }
          element[keyToAlias] = aliasedPropValue
        }
      }
    })
    // let elementsAlias = elements[key].elements_alias
    // if (elementsAlias) {
    //   let aliasedElements = elements[elementsAlias].elements
    //   elements[key].elements = aliasedElements.slice()
    // }
  })
  Object.keys(elements).forEach(key => {
    let keyElement = elements[key]
    let overrideKey = 'override--' + key
    let overrideElement = {
      label: keyElement.label || keyElement.heading || keyElement.title
    }
    if (keyElement.elements) {
      let keySubelement = 'override--subelement--' + key
      let dependObj = {}
      dependObj['!' + overrideKey] = 'hide'
      elements[keySubelement] = {
        type: 'group',
        elements: keyElement.elements.map(function (el) {
          return 'override--' + el
        }),
        depends: [dependObj]
      }
      overrideElement.subelement = keySubelement
    }
    elements[overrideKey] = Object.assign({}, elements['default:overrides-show-hide'], overrideElement)
  })
}
processElements()

function getValue (path, defaultValue) {
  return get(elements, path, defaultValue)
}

function getRawValue (path, defaultValue) {
  return get(elementsSrc, path, defaultValue)
}

function setValue (objPath, value) {
  set(elementsSrc, objPath, value)
  processElements()
  let tmpPath = path.resolve(os.tmpdir(), 'elements-backup.json')
  console.log(`Saved tmp file to ${tmpPath}`)
  fs.writeFile(tmpPath, stringify(elementsSrc), () => {})
  if (true || process.env.AUTOSAVE) {
    console.log('Autosaving elements')
    save()
  }
  return true
}

function getTypes () {
  let seen = {}
  let keys = Object.keys(elementsSrc).map(key => {
    return elementsSrc[key].type
  }).filter(type => {
    let seenit = seen[type]
    seen[type] = true
    return !seenit
  })
  return keys.sort()
}
function getKeys (type) {
  let keys = Object.keys(elementsSrc)
  if (type) {
    keys = keys.filter(key => {
      return elementsSrc[key].type === type
    })
  }
  return keys // .sort()
}
function getAll (type, value) {
  let keys = Object.keys(elementsSrc)
  if (type) {
    keys = keys.filter(key => {
      return elementsSrc[key][type] === value
    })
  }
  return keys
}

// function xgetAll (type, value) {
//   return Object.keys(elementsSrc)
//     .filter(function (key) {
//       return elementsSrc[key][type] === value
//     })
//     .map(function (key) {
//       return Object.assign({key: key}, elementsSrc[key])
//     })
// }

module.exports = {
  elementsSrc,
  elements,
  get: getValue,
  set: setValue,
  getRaw: getRawValue,
  getAll,
  getKeys,
  getTypes,
  save
}
