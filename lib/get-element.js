'use strict'

let coreMethods = {
  get: () => {},
  set: () => {},
  getRaw: () => {},
  getAll: () => {}
}

function setLocalisation (methods) {
  coreMethods = Object.assign({}, coreMethods, methods)
}

function marshallDefaultValue (defaultValue, options) {
  if (typeof defaultValue === 'object') {
    options = defaultValue
    defaultValue = options['defaultValue']
  }
  options = options || {}
  options['defaultValue'] = defaultValue
  return options
}

function getElement (element, defaultValue, options) {
  options = marshallDefaultValue(defaultValue, options)
  if ((!options.valueStrict && options.value) || (options.valueStrict && options.value !== undefined)) {
    return options.value
  }
  defaultValue = options['defaultValue']
  delete options['defaultValue']
  let path = element
  if (options.prop) {
    if (Array.isArray(options.prop)) {
      for (let i = 0, pLength = options.prop.length; i < pLength; i++) {
        let value = coreMethods.get(path + '.' + options.prop[i])
        if ((!options.propStrict && value) || (options.propStrict && value !== undefined)) {
          return value
        }
      }
      return defaultValue
    } else {
      path = path + '.' + options.prop
    }
  }
  return coreMethods.get(path, defaultValue)
}
function getElementProp (element, prop, defaultValue, options) {
  options = marshallDefaultValue(defaultValue, options)
  options.prop = prop
  return getElement(element, options)
}

function getElementRaw (element) {
  return coreMethods.getRaw(element)
}

function setElement (element, value) {
  return coreMethods.set(element, value)
}

function setElementProp (element, prop, value) {
  return coreMethods.set(element + '.' + prop, value)
}

module.exports = {
  setLocalisation,
  marshallDefaultValue,
  getElement,
  getElementProp,
  getElementRaw,
  setElement,
  setElementProp
}
