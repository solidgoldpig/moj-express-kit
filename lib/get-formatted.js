'use strict'

let Markdown = require('markdown').markdown.toHTML
let Marked = require('marked')
// Marked.setOptions({
//   gfm: true,
//   tables: true
//   // breaks: false,
//   // pedantic: false,
//   // sanitize: true,
//   // smartLists: true,
//   // smartypants: false
// });
let MessageFormat = require('messageformat')
let msgFormats = {}
msgFormats['en-GB'] = new MessageFormat('en-GB')
let defaultLocale = 'en-GB'

let ElementMethods = require('./get-element')
let marshallDefaultValue = ElementMethods.marshallDefaultValue
let getElement = ElementMethods.getElement
let getElementProp = ElementMethods.getElementProp

function setFormat (baseArgs, options) {
  baseArgs = baseArgs || {}
  options = options || {}
  let locale = options.locale || defaultLocale
  let errors = options.errors || []

  let recurseMatch = /\|([\s\S]+?)\|/
  function reformat (value, args) {
    if (value.match(recurseMatch)) {
      value = value.replace(recurseMatch, (m, m1) => {
        let keyParams = m1.trim()
        // TODO: allow to pass in params
        let keyName = keyParams
        let keyProp = 'value'
        if (keyParams.includes('#')) {
          let keysParamsChunks = keyParams.split('#')
          keyName = keysParamsChunks[0]
          keyProp = keysParamsChunks[1]
        } else {
          
        }
        let nestedValue = getFormattedProp(keyName, keyProp, undefined, {args})
        return nestedValue
      })
      value = reformat(value, args)
    }
    return value
  }
  function markdown (value) {
    return  Markdown(value)
  }
  function format (value, args) {
    if (!value) {
      return ''
    }
    if (typeof value !== 'string') {
      return value.toString()
    }

    // Substitute in-phrase hyphens with non-breaking unicode character U+2011
    // value = value.replace(/(\w)-(\w)/g, '$1‑$2')
    // value = value.replace(/ - /g, ' – ') // en dash

    // value = value.replace(/ - /g, '—') // em dash
    // value = value.replace(/ - /g, ' – ')
    // value = value.replace(/ – /g, '<span style="white-space:pre"> – </span>')
    // value = value.replace(/ - /g, '&nbsp;–&nbsp;')

    if ((value.indexOf('{') === -1) && !value.match(recurseMatch)) {
      return value
    }
    args = args || baseArgs

    value = value.replace(/\\\|/g, '##PIPE##')
    let formatted
    try {
      formatted = msgFormats[locale].compile(value)(args)
    } catch (e) {
      formatted = value + ': ' + e.message
    }
    formatted = reformat(formatted, args)
    formatted = formatted.replace(/##PIPE##/g, '|')
    return formatted
  }
  function getFormatted (element, defaultValue, options) {
    options = marshallDefaultValue(defaultValue, options)
    let value = getElement(element, options)
    return format(value, options.args)
  }
  function getFormattedProp (element, prop, defaultValue, options) {
    options = marshallDefaultValue(defaultValue, options)
    let value = getElementProp(element, prop, options)
    return format(value, options.args) // .replace(/ ([^ ]+)$/, '&nbsp;$1')
  }
  function getFormattedBody (element, prop, defaultValue, options) {
    options = marshallDefaultValue(defaultValue, options)
    let value = getElementProp(element, prop || 'body', Object.assign({}, options))
    if (value === undefined && !prop) {
      value = getElement(element, options)
    }
    if (value) {
      value = value.trim()
    }
    let formattedBody = format(value, options.args)
    if (options.markdown !== false) {
      formattedBody = Markdown(formattedBody)
      // Marked chokes on parentheses inside link parantheses delimiters
      // formattedBody = Marked(formattedBody)
      formattedBody = formattedBody.replace(/<ol>/g, '<ol class="list list-number">')
      formattedBody = formattedBody.replace(/<ul>/g, '<ul class="list list-bullet">')
      formattedBody = formattedBody.replace(/<h1>/g, '<h1 class="heading-xlarge">')
      formattedBody = formattedBody.replace(/<h2>/g, '<h2 class="heading-large">')
      formattedBody = formattedBody.replace(/<h3>/g, '<h3 class="heading-medium">')
    }
    //  | trim | replace("\n", "</p><p>"
    return formattedBody
  }
  function getString (element, defaultValue, options) {
    let value = getFormattedBody(element, 'value', defaultValue, options)
    if (value) {
      value = value.replace(/^\s*<p>/, '').replace(/<\/p>\s*$/, '')
    }
    return value
  }
  function getError (element, options) {
    options = options || {}
    let error = options.error
    if (!error && errors) {
      error = errors[element] ? errors[element] : ''
    }
    return error
  }
  function getFormattedError (element, options) {
    options = options || {}
    let error = getError(element, options)
    let formattedError = error
    if (typeof error === 'object') {
      let errorType = options.header ? 'error-header' : 'error'
      formattedError = getElementProp(errorType + ':' + error.name, 'value')
    }
    return format(formattedError, {
      control: getFormattedProp(element, 'label'),
      argument: error.argument
    })
  }

  return Object.assign(ElementMethods, {
    format,
    markdown,
    getFormatted,
    getFormattedProp,
    getFormattedBody,
    getString,
    getError,
    getFormattedError
  })
}

module.exports = {
  setFormat
}
