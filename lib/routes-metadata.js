'use strict'

const fs = require('fs')
const path = require('path')
const mkdirp = require('mkdirp')
const request = require('request-promise-native')
const express = require('express')
const router = express.Router()

const logger = require('./logger')

// let get = require('lodash/get')
// let set = require('lodash/get')
const flattenDeep = require('lodash/flattenDeep')
// let Markdown = require('markdown').markdown.toHTML
const shortid = require('shortid')

const jsonschema = require('jsonschema')
const validator = new jsonschema.Validator()

const matchProp = require('./match-prop')
const getRouteHierarchy = require('./route-hierarchy')

const env = (process.env.NODE_ENV || 'development').toLowerCase()
const production = env === 'production'

let flagsSrc = path.join(process.cwd(), 'metadata/flags.json')
let flags = require(flagsSrc)
if (!production) {
  // flags.devlinks = true
}

let overrides = {}
let sessions = {}

let elementMethods = require('./get-element')
let { getElement, getElementProp, getElementRaw, setElement } = elementMethods
// let getElementRaw = elementMethods.getElementRaw
// let getElementProp = elementMethods.getElementProp
// let setElement = elementMethods.setElement
// let setElementProp = elementMethods.setElementProp

let elementsDal = require('./elements-dal')
let i18n = elementsDal.elementsSrc

let bodyParser = require('body-parser')

elementMethods.setLocalisation(elementsDal)

let Formatted = require('./get-formatted')

let getFieldValues

function recurseElements (node) {
  let nestedElements = []
  if (!node) {
    return nestedElements
  }
  if (typeof node === 'string') {
    node = [node]
  }
  node.forEach(el => {
    let subelement = getElementProp(el, 'subelement')
    if (subelement) {
      nestedElements.push(subelement)
      nestedElements.push(recurseElements(subelement))
    }
    let checkbox = getElementProp(el, 'type') === 'checkboxGroup'
    if (checkbox) {
      let options = getElementProp(el, 'options')
      if (options) {
        nestedElements.push(options)
        nestedElements.push(recurseElements(options))
        // options.forEach(opt => {
        //   let optReveals = getElementProp(opt, 'reveals')
        //   if (optReveals) {
        //     nested_elements.push(optReveals)
        //     nested_elements.push(recurseElements(optReveals))
        //   }
        // })
      }
    }
  })
  return nestedElements
}

function handleError (res, err) {
  res.status(500).send(err)
}

// TODO: these look redundant
router.use('/public', express.static('custom/resources'))
router.use('/public', express.static('base/resources'))

// TODO: these look duplicated
router.use(bodyParser.json())
router.use(bodyParser.urlencoded({
  extended: true
}))

let getRouteUrl = function () {}
const globalMethods = (req, res, next) => {
  // TODO: move to final render section? NOPE. But do extricate 
  let nunjucksEnv = res.app.locals.settings.nunjucksEnv
  nunjucksEnv.addGlobal('req', req)
  nunjucksEnv.addGlobal('res', res)
  nunjucksEnv.addGlobal('getRouteUrl', getRouteUrl)
  let FormattedMethods = Formatted.setFormat({}, {})
  Object.keys(FormattedMethods).forEach(key => {
    nunjucksEnv.addGlobal(key, FormattedMethods[key])
  })
  nunjucksEnv.addGlobal('splitWord', word => {
    return word.replace(/_/g, '_<wbr>')
  })
  nunjucksEnv.addGlobal('spaceToPlus', word => {
    return word.replace(/ /g, '+')
  })
  next()
}
// router.use(globalMethods)
router.globalMethods = globalMethods

router.get('/dump', (req, res) => {
  // console.log(req.app._router.stack)
  // router.stack = router.stack.filter(r => r.name !== 'routeHandler')
  router.stack.forEach(r => {
    logger('stack route', r.regexp.toString())
  })
  // console.log(router)
  return res.send('dump')
})
router.get('/google', (req, res) => {
  request('https://www.google.co.uk')
    .then(htmlString => {
      let serverAddress = req.protocol + '://' + req.headers.host
      htmlString = htmlString.replace(/<head>/, '<head><base href="http://www.google.co.uk/">')
      htmlString = htmlString.replace(/�/g, ' ')
      htmlString = htmlString.replace(/action="\/search"/, `action="${serverAddress}/google-results"`)
      res.send(htmlString)
    })
    .catch(err => {
      handleError(res, err)
    })
})
router.get('/google-results', (req, res) => {
  //  {form:{f:'scooby snacks'}}
  let query = req.query.q
  request('https://www.google.co.uk/search?q=' + query)
    .then(htmlString => {
      htmlString = htmlString.replace(/<head>/, '<head><base href="http://www.google.co.uk/">')
      htmlString = htmlString.replace(/�/g, '£')
      // let blocks = htmlString.match(/([\s\S]+?<ol>)\s*(<div class="g">[\s\S]+)/)
      let blocks = htmlString.match(/([\s\S]+?)(<div class="g"><h3 class="r">[\s\S]+)/)
      let serverAddress = req.protocol + '://' + req.headers.host
      res.render('templates/google-results', { blocks, serverAddress })
    })
    .catch(err => {
      handleError(res, err)
    })
})
router.get('/admin/sessions', (req, res) => {
  req.session.admin = true
  delete sessions[req.sessionID]
  res.render('admin/sessions/sessions', { sessions: Object.keys(sessions) })
})
router.get('/admin/session/:sessionID', (req, res) => {
  let sessionID = req.params.sessionID
  if (req.query.delete) {
    delete sessions[sessionID]
    res.redirect('/admin/sessions')
    return
  }
  req.sessionStore.get(sessionID, (err, session) => {
    if (err) {
      handleError(res, err)
    }
    if (req.query.clone) {
      req.session.autofields = Object.assign({}, session.autofields)
      // res.redirect('/admin/session/'+sessionID)
      res.redirect('/admin/sessions')
      return
    }
    let clonedSession = req.headers.referer && req.headers.referer.match(/clone/)
    res.render('admin/session/session', {
      sessionID,
      autofields: session.autofields,
      autofieldsJSON: JSON.stringify(session.autofields, null, 2),
      cloned_session: clonedSession
    })
  })
})
router.get('/admin/flags', (req, res) => {
  res.render('admin/flags/flags', { flags })
})
router.get('/api/flag/:flag/:state', (req, res) => {
  let state = req.params.state.toLowerCase() !== 'off'
  flags[req.params.flag] = state
  if (req.headers.referer.match(/\/admin\/flags/)) {
    res.redirect(req.headers.referer)
  } else {
    res.json(flags)
  }
})
router.get('/admin/overrides', (req, res) => {
  res.render('admin/overrides/overrides', {
    overrides,
    json: JSON.stringify(overrides, null, 2),
    autofields: req.session.autofields
  })
})
router.get('/admin/autofields', (req, res) => {
  let autofields = req.session.autofields
  res.render('admin/autofields/autofields', {
    autofields,
    json: JSON.stringify(autofields, null, 2)
  })
})
router.all('/admin/report', (req, res) => {
  let report = {}
  if (typeof req.body === 'object' && req.body.report) {
    report = JSON.parse(req.body.report)
  }
  res.render('admin/report/report', {
    report,
    json: JSON.stringify(report, null, 2)
  })
})
router.get('/admin/routes', (req, res) => {
  let routes = getElementProp('routes', 'routes')
  res.render('admin/routes/routes', { routes })
})
router.get('/admin/elements/:type', (req, res) => {
  let keys = elementsDal.getKeys(req.params.type).sort()
  res.render('admin/elements/elements', {
    keys,
    type: req.params.type
  })
})
router.get('/admin/elements', (req, res) => {
  let types = elementsDal.getTypes().sort()
  res.render('admin/element-types/element-types', { types })
})
router.get('/admin/element/:element', (req, res) => {
  let element = getElement(req.params.element) || {}
  let type = element.type
  if (type === 'string') {
    res.redirect(req.originalUrl.replace(/element/, 'string'))
    return
  }
  if (type === 'error') {
    res.redirect(req.originalUrl + '/value')
    return
  }
  let stringProps = Object.keys(element).filter(key => typeof element[key] === 'string')
  let allProps = Object.keys(element).filter(key => {
    if (key === 'type') {
      return false
    }
    if (key.indexOf('x') === 0) {
      return false
    }
    return true
  })
  // redirect single value props
  if (allProps.length === 1 && typeof allProps[0] === 'string') {
    res.redirect(req.originalUrl + '/' + allProps[0])
    return
  }
  res.render('admin/element/element', {
    element: req.params.element,
    elementJSON: JSON.stringify(getElementRaw(req.params.element) || {}, null, 2),
    stringProps
  })
})
router.post('/admin/element/:element', (req, res) => {
  if (req.body && req.body.element) {
    let element = req.body.element
    if (typeof element === 'string') {
      try {
        element = JSON.parse(element)
      } catch (e) {
        res.status(500).send('Invalid JSON')
      }
    }
    setElement(req.params.element, element)
    registerRoutes()
    res.redirect(req.originalUrl)
    // elementsDal.save().then(() => {
    //   res.redirect(req.originalUrl)
    // })
  } else {
    res.redirect(req.originalUrl)
  }
})
router.get('/admin/element/:element/:prop', (req, res) => {
  let element = req.params.element
  let doesNotExist = getElement(req.params.element) === undefined
  let prop = req.params.prop
  res.render('admin/string/string', {
    doesNotExist,
    element,
    prop,
    value: getElementProp(element, prop) || ''
  })
})
router.post('/admin/element/:element/:prop', (req, res) => {
  let element = getElement(req.params.element)
  if (req.body && req.body.value !== undefined && element) {
    element[req.params.prop] = req.body.value
    setElement(req.params.element, element)
    res.redirect(req.originalUrl)
    // elementsDal.save().then(() => {
    //   res.redirect(req.originalUrl)
    // })
  } else {
    res.redirect(req.originalUrl)
  }
})
router.get('/admin/string/:element', (req, res) => {
  res.render('admin/string/string', {
    type: 'string',
    element: req.params.element,
    value: getElementProp(req.params.element, 'value') || ''
  })
})
router.post('/admin/string/:element', (req, res) => {
  if (req.body && req.body.value !== undefined) {
    let element = {
      type: 'string',
      value: req.body.value
    }
    setElement(req.params.element, element)
    res.redirect(req.originalUrl)
    // elementsDal.save().then(() => {
    //   res.redirect(req.originalUrl)
    // })
  } else {
    res.redirect(req.originalUrl)
  }
})
router.post('/api/overrides', (req, res) => {
  let resObj = {
    action: req.originalUrl,
    payload: req.body
  }
  if (typeof req.body === 'object') {
    overrides = req.body
    res.json(resObj)
    return
  }
  resObj.error = true
  res.status(500).json(resObj)
})
router.post('/api/autofields', (req, res) => {
  let resObj = {
    action: req.originalUrl,
    payload: req.body
  }
  if (typeof req.body === 'object') {
    req.session.autofields = req.body
    res.json(resObj)
    return
  }
  resObj.error = true
  res.status(500).json(resObj)
})
router.post('/api/autofield', (req, res) => {
  let resObj = {
    action: req.originalUrl,
    payload: req.body
  }
  if (typeof req.body === 'object') {
    req.session.autofields = req.session.autofields || {}
    Object.keys(req.body).forEach(key => {
      req.session.autofields[key] = req.body[key]
    })
    res.json(resObj)
    return
  }
  resObj.error = true
  res.status(500).json(resObj)
})
router.get('/admin/manage/:route', (req, res) => {
  let route = Object.assign({}, getElement(req.params.route))
  let elements
  if (route.elements) {
    elements = route.elements.map(r => {
      let rLabel = getElementProp(r, ['heading', 'label'])
      rLabel = r + (rLabel ? ' - ' + rLabel : '')
      return {
        name: `skip:${r}`,
        label: rLabel,
        value: 'yes'
      }
    })
  }
  res.render('admin/toggle/toggle', { elements: elements })
})

router.get('/api/element/:type/:value', (req, res) => {
  res.json(elementsDal.getAll(req.params.type, req.params.value) || [])
})
router.get('/api/element/:element', (req, res) => {
  res.json(getElement(req.params.element) || {})
})
router.post('/api/element/:element', (req, res) => {
  let resObj = {
    action: req.originalUrl,
    payload: req.body
  }
  if (typeof req.body === 'object') {
    let result = setElement(req.params.element, req.body)
    if (result) {
      resObj.success = true
      res.json(resObj)
      return
    }
  }
  resObj.error = true
  res.status(500).json(resObj)
})

router.post('/api/elements/save', (req, res) => {
  elementsDal.save().then(els => {
    if (req.headers.referer.match(/\/admin\//)) {
      res.redirect(req.headers.referer)
    } else {
      res.json(els)
    }
  }).catch(e => {
    res.json({
      error: e,
      wuh: 'huh?'
    })
  })
})

function registerRoutes () {
  router.stack = router.stack.filter(r => r.name !== 'routeHandler')
  let rootUrl = '/'

  // let storeValues = function () {
  //   return (req, res) => {
  //     let controller = new Promise(function (resolve) {})
  //   }
  // }
  let getDefaultController = (req, res) => {
    return () => Promise.resolve()
  }
  // let routesConfig = require('./metadata/routes.json')
  let routes = getElementProp('routes', 'routes') // routesConfig.routes

  let routesFlattened = {}
  // let elementRouteMapping = {}
  function flattenRoutes (routes, urlPrefix, hierarchy) {
    // hierarchy = hierarchy || []
    urlPrefix = urlPrefix.replace(/\/+$/, '')
    routes.forEach((routeName, index) => {
      let routeHierarchy = hierarchy ? hierarchy.slice() : []
      if (!routesFlattened[routeName]) {
        routesFlattened[routeName] = Object.assign({}, getElement(routeName))
        // let routeExtends = routesFlattened[routeName].isa
        // if (routeExtends) {
        //   routesFlattened[routeName] = Object.assign({}, pages[routeExtends], routesFlattened[routeName])
        //   i18n['route.' + routeName] = Object.assign({}, i18n['route.' + routeExtends], i18n['route.' + routeName])
        // }
      }
      let route = routesFlattened[routeName]
      route.hierarchy = routeHierarchy.slice()
      route.hierarchy.push(routeName)
      route.wizard = route.hierarchy[0]
      // route.selected_hierarchy = route.hierarchy.slice(1)
      routeHierarchy.push(routeName)
      route.url = route.url || routeName
      if (route.url.indexOf('/') !== 0) {
        route.url = urlPrefix + '/' + route.url
      }
      if (route.steps) {
        // console.log('REDIRECT TOP', routeName, route.steps[0])
        routesFlattened[routeName].redirect = route.steps[0]
        route.steps.forEach((step, i) => {
          routesFlattened[step] = Object.assign({}, getElement(step))
          if (route.steps[i + 1]) {
            // console.log('REDIRECT STEP', step, route.steps[i + 1])
            routesFlattened[step].redirect = route.steps[i + 1]
          } else if (routes[index + 1] && hierarchy) {
            // console.log('MISSED STEP', step, routes[index + 1])
            routesFlattened[step].redirect = routes[index + 1]
          }
        })
        let routeUrlPrefix = route.url
        if (routeUrlPrefix.indexOf('/') !== 0) {
          routeUrlPrefix = urlPrefix + '/' + routeUrlPrefix
        }
        flattenRoutes(route.steps, routeUrlPrefix, routeHierarchy)
      }
    })
  }
  flattenRoutes(routes, rootUrl)

  getRouteUrl = function (name, params, options) {
    options = options || {}
    let url = '/dev/null'
    if (routesFlattened[name]) {
      url = routesFlattened[name].url
    }
    if (options.edit) {
      url += '/change'
    }
    return url
  }

  let wizardHierarchy = getRouteHierarchy(routes, routesFlattened)
  // console.log('wizardHierarchy', JSON.stringify(wizardHierarchy, null, 2))

  let routeUrls = {}
  // let blah = Object.keys(routesFlattened).sort(function(a, b){
  //   return getRouteUrl(a).localeCompare(getRouteUrl(b))
  // }).reverse()
  // console.log(blah)
  Object.keys(routesFlattened).sort((a, b) => {
    return getRouteUrl(a).localeCompare(getRouteUrl(b))
  }).reverse().forEach(routeName => {
    let route = routesFlattened[routeName]
    logger('Serving', routeName, '=>', route.url)
    route.id = routeName
    // if (!route.id.match(/route:/)) {
    //   route.id = 'route:' + route.id
    // }
    route.key = routeName.replace(/^route:/, '')

    let method = route.method || 'use'
    let url = route.url
    routeUrls[routeName] = url
    let routeController = route.controller ? require('./controllers/' + route.controller) : getDefaultController

    let routeHandler = (req, res, next) => {
      if (url !== req.originalUrl) {
        const testUrl = req.originalUrl.replace(/\/(edit|flowchart)$/, '') || '/'
        if (url !== testUrl) {
          next()
          return
        }
      }

      getFieldValues = () => {
        if (!req.session.autofields) {
          req.session.autofields = {}
        }
        return req.session.autofields
      }
      function getFieldValue (name) {
        let values = (route.overrides || getElementProp(name, 'override')) ? overrides : getFieldValues()
        let value = values[name]
        if (value === undefined) {
          value = getElementProp(name, 'default')
        }
        return value
      }
      function setFieldValue (name, value) {
        let values = (route.overrides || getElementProp(name, 'override')) ? overrides : getFieldValues()
        values[name] = value
        return values[name]
      }
      getFieldValues()

      let sessionID = req.sessionID
      if (!req.session.admin) {
        sessions[sessionID] = true
      } else {
        delete sessions[sessionID]
      }

      let isFlowchart = !!req.path.match(/\/flowchart$/)
      let isEdit = !!req.path.match(/\/edit$/)

      let routeHandler = routeController(req, res)
      // Call controller if exists
      logger('use routeName', routeName)
      if (!req.session.access_code) {
        req.session.access_code = shortid.generate()
      }
      // if (req.url !== '/') {
      //   let possibleCode = req.url.replace(/^\//, '')
      //   if (possibleCode !== 'change') {
      //     req.session.access_code = possibleCode
      //   }
      // }
      let accessCode = req.session.access_code.substr(0, 10)
      let elements = (route.elements || []).slice()
      // let elementsToValidate = elements.slice()
      let elementsFound = flattenDeep(elements.concat(recurseElements(elements)))
      // console.log('elements_found', elements_found)

      let elementTriggers = {}
      let protectedElements = {}
      elementsFound.forEach(el => {
        let deps = getElementProp(el, 'depends')
        if (deps) {
          deps.forEach(dep => {
            Object.keys(dep).forEach(inkey => {
              let key = inkey
              let negated
              if (key.indexOf('!') === 0) {
                negated = true
                key = key.substr(1)
              }
              let matchRegex = new RegExp('^' + key + '$')
              let matchedKeys = elementsFound.filter(el => {
                return el.match(matchRegex)
              })
              if (matchedKeys.length) {
                protectedElements[el] = true
              }
              matchedKeys.forEach(match => {
                elementTriggers[match] = elementTriggers[match] || []
                elementTriggers[match].push({
                  reveals: el,
                  match: new RegExp('^' + dep[inkey] + '$'),
                  yematch: '^' + dep[inkey] + '$',
                  negated: negated
                })
              })
              // console.log('key', key)
              // console.log('matchedKeys', matchedKeys)
            })
          })
          // console.log(el, 'deps', JSON.stringify(deps, null, 2))
        }
      })

      function checkReveals (name, value) {
        let passed
        let checks = elementTriggers[name]
        if (checks) {
          // console.log(name, 'checks', JSON.stringify(checks, null, 2))
          for (let i = 0, clength = checks.length; i < clength; i++) {
            // check that value is coerced to string
            let match = value.match(checks[i].match)
            // console.log('yematch', checks[i].yematch, checks[i].match)
            // console.log('initial match', match)
            if (checks[i].negated) {
              match = !match
              // console.log('negated match', match)
            }
            if (match) {
              passed = checks[i].reveals
              break
            }
          }
        }
        return passed
      }
      let errors
      if (req.method === 'POST') {
        errors = {}
        elementsFound.forEach(el => {
          let inboundValue = req.body[el]
          let schema = Object.assign({}, getElement(el))
          schema.type = schema.type || 'string'
          if (schema.type.match(/number|integer/)) {
            inboundValue = inboundValue ? Number(inboundValue) : undefined
          } else if (schema.type === 'radioGroup') {
            schema.type = 'string'
            let optionsEnum = schema.options.map(option => {
              return getElementProp(option, 'value')
            })
            schema.enum = optionsEnum
          }
          let validationError = validator.validate(inboundValue, schema).errors
          if (validationError.length) {
            errors[el] = validationError[0]
            // console.log('el', el, errors[el])
          }
        })
        if (!Object.keys(errors).length) {
          errors = undefined
        }
        if (req.body) {
          elementsFound.forEach(el => {
            setFieldValue(el, req.body[el])
          })
          Object.keys(req.body).filter(el => elementsFound.indexOf(el) === -1).forEach(el => {
            if (el !== 'updateForm') {
              setFieldValue(el, req.body[el])
            }
          })
        }
        // console.log('SESSION', JSON.stringify(req.session, null, 2))
      }
      // console.log('referer', req.referer, req.get('referrer'))
      // console.log('elements_found', elements_found)
      let values = {}
      elementsFound.forEach(el => {
        values[el] = getFieldValue(el)
      })
      // console.log('values', values)
      let autofields = getFieldValues()
      // if (route.overrides) {
      //   autofields = Object.assign({}, autofields, overrides)
      // }
      let routeInstance = Object.assign({}, route, {
        values: values,
        autofields: autofields,
        overrides: overrides,
        elements_base: route.elements,
        elements_found: elementsFound
      })
      let checkNoDependency = (name, skip) => {
        let dependencyMet = true
        if (skip && protectedElements[name]) {
          return dependencyMet
        }
        let displayOverride = getFieldValue('override--' + name)
        if (displayOverride === 'show') {
          return true
        } else if (displayOverride === 'hide') {
          return false
        }
        let depends = getElementProp(name, 'depends')
        if (depends) {
          // console.log('DEPENDS', JSON.stringify(depends, null, 2))
          // console.log('autofields', autofields)
          dependencyMet = matchProp(autofields, depends)
        }
        return dependencyMet
      }
      function checkRevealRequired (name) {
        return !!protectedElements[name]
      }
      if (isFlowchart || isEdit || req.query.showall) {
        checkNoDependency = () => true
      }
      let businessElements = routeInstance.elements
      if (businessElements) {
        businessElements = businessElements.filter(el => {
          return !getElementProp(el, 'auxilliary') && checkNoDependency(el, true)
        })
        routeInstance.elements = businessElements
      }
      routeHandler(routeInstance, Object.assign(
        {},
        elementMethods,
        {
          checkNoDependency: checkNoDependency
        }
      ))
        .then(routeOutcome => {
          let routeInstanceFinal = Object.assign({}, routeInstance, routeOutcome)
          let wizard = routeInstanceFinal.wizard
          let autofields = routeInstanceFinal.autofields
          if ((wizard && routesFlattened[wizard].useOverrides) || routeInstanceFinal.useOverrides) {
            autofields = Object.assign({}, autofields, overrides)
          }
          req.session.visited = req.session.visited || {}
          let wizardlastRoute
          if (wizard && wizardHierarchy[wizard]) {
            wizardlastRoute = wizardHierarchy[wizard].lastRoute
          }
          if (wizardlastRoute === routeName) {
            routeInstanceFinal.wizardlastRoute = true
            req.session.visited[wizardlastRoute] = true
          }
          let redirectUrl = routeUrls[routeInstanceFinal.redirect] || routeInstanceFinal.redirect
          if (!errors && req.method === 'POST' && routeInstanceFinal.redirect && req.originalUrl !== routeInstanceFinal.redirect && req.body.updateForm !== 'yes') {
            req.session.visited[routeName] = true
            if (req.originalUrl.match(/\/change$/)) {
              if (wizardlastRoute) {
                let redirectRoute = wizardlastRoute
                if (getElementProp(wizardlastRoute, 'template') !== 'summary') {
                  let newRedirectRoute = getElementProp(wizardlastRoute, 'redirect')
                  if (newRedirectRoute) {
                    redirectRoute = newRedirectRoute
                  }
                }
                redirectUrl = getRouteUrl(redirectRoute)
              }
              // redirectUrl = req.get('referrer')
            }
            res.redirect(redirectUrl)
          } else {
            if (route.elements && (!routeInstanceFinal.elements || !routeInstanceFinal.elements.length)) {
              logger(req.originalUrl, 'REDIRECT TO', redirectUrl)
              res.redirect(redirectUrl)
              return
            }
            // Work out number of wizard steps, the number of the step and the wizard flow data (for flowchart generation)
            let routeWizard = wizardHierarchy[routeInstanceFinal.wizard]
            if (routeWizard && routeWizard.slice && routeInstanceFinal.template === 'step-by-step') {
              let stepsFlat = routeWizard.stepsFlat.slice()
              let lastRoute = routeWizard.lastRoute
              routeWizard = routeWizard.slice()
              routeWizard.unshift({
                route: routeInstanceFinal.wizard
              })
              stepsFlat.unshift(routeInstanceFinal.wizard)
              routeWizard = routeWizard.filter(step => {
                return overrides['override--action-section--' + step.route.replace(/^route:/, '')] !== 'hide'
              })
              stepsFlat = stepsFlat.filter(route => {
                return !overrides['override--action-section--' + route.replace(/^route:/, '')] !== 'hide'
              })
              routeWizard.stepsFlat = stepsFlat
              routeWizard.lastRoute = lastRoute
            }
            // console.log('req.session.id', JSON.stringify(req.session.id, null, 2))
            // console.log('req.sessionID', JSON.stringify(req.sessionID, null, 2))
            // console.log('req.sessionStore', req.sessionStore)
            // req.sessionStore.get(req.sessionID, function(sesh){
            // console.log('req.sessionID', req.sessionID, sesh)
            // })
            let wizardStepCount
            let wizardStepsLength
            let wizardSectionCount
            let wizardSectionCurrent
            let wizardSectionLength
            if (routeWizard) {
              let theWiz = routeWizard.stepsFlat.slice()
              // let wizExpose = theWiz.map(step => {
              //   return Object.assign({ name: step }, getElement(step))
              // })
              // console.log('wizExpose', JSON.stringify(wizExpose, null, 2))
              if (routeInstanceFinal.template !== 'step-by-step') {
                theWiz.pop()
              }
              // console.log(theWiz)
              theWiz = theWiz.filter(step => {
                return routesFlattened[step] && routesFlattened[step].elements
              })
              wizardStepsLength = theWiz.length
              wizardStepCount = theWiz.indexOf(routeName)
              if (routeInstanceFinal.hierarchy) {
                let wizHier = routeWizard.slice().map(step => {
                  return step.route
                })
                wizHier.pop()
                wizardSectionLength = wizHier.length
                wizardSectionCurrent = routeInstanceFinal.hierarchy[1]
                wizardSectionCount = wizHier.indexOf(wizardSectionCurrent)
                if (wizardSectionCount > -1) {
                  wizardSectionCount++
                } else {
                  wizardSectionCount = 0
                }
              }
              if (wizardStepCount > -1) {
                wizardStepCount++
              } else {
                wizardStepCount = 0
              }
            }

            let appData = {
              env,
              production,
              urls: routeUrls,
              autofields,
              wizards: wizardHierarchy,
              accessCode
            }
            appData.errors = {
              length: (errors ? Object.keys(errors).length : 0)
            }
            // if (wizardStepCount) {
            appData.wizard = {
              steps: {
                length: wizardStepsLength,
                count: wizardStepCount,
                last: wizardStepCount === wizardStepsLength,
                remaining: wizardStepsLength + 1 - wizardStepCount
              },
              sections: {
                length: wizardSectionLength,
                count: wizardSectionCount,
                current: wizardSectionCurrent
              }
            }
            // }

            let appDataFormatArgs = {}
            let primeAppKeys = (obj, prefix) => {
              prefix = prefix || 'app'
              Object.keys(obj).forEach(key => {
                let keyPrefix = prefix + ':' + key
                if (typeof obj[key] === 'object') {
                  primeAppKeys(obj[key], keyPrefix)
                } else {
                  appDataFormatArgs[keyPrefix] = obj[key]
                }
              })
            }
            primeAppKeys(appData)
            appData.json = {
              elements: JSON.stringify(i18n, null, 2)
            }

            // req.session.autofields
            let formatArgs = Object.assign(appDataFormatArgs, autofields, values, (isEdit && req.query ? req.query : {}))
            if (routeInstanceFinal.overrides) {
              formatArgs = Object.assign({}, formatArgs, overrides)
            }
            let FormattedMethods = Formatted.setFormat(formatArgs, { errors })

            let routeVisited = route => {
              return req.session.visited[route]
            }
            // let expandedElements = []
            let formatProperties = [
              'label',
              'sublabel',
              'hint',
              'body',
              'title',
              'heading',
              'lede'
            ]
            let arrayProperties = [
              'options',
              'elements'
            ]
            let objectProperties = [
              'subelement'
            ]
            let expandElements = (elements, parent) => {
              let expanded = []
              elements.forEach(name => {
                let element = Object.assign({}, getElement(name))
                formatProperties.forEach(prop => {
                  if (element[prop]) {
                    element[prop] = FormattedMethods.getFormattedProp(name, prop)
                  }
                })
                arrayProperties.forEach(prop => {
                  if (element[prop]) {
                    element[prop] = expandElements(element[prop], name)
                  }
                })
                objectProperties.forEach(prop => {
                  if (element[prop]) {
                    element[prop] = expandElements([element[prop]])[0]
                  }
                })
                let value = autofields[name]
                if (element.type === 'option') {
                  if (!element.value) {
                    element.name = name
                    element.value = 'yes'
                  } else {
                    value = autofields[parent]
                  }
                  if (element.value === value) {
                    element.checked = true
                  }
                  let ariaControls = checkReveals(name, element.value)
                  if (ariaControls) {
                    element.ariaControls = ariaControls
                  }
                } else if (typeof value !== undefined) {
                  element.value = value
                }

                if (checkRevealRequired(name)) {
                  element.ariaHidden = true
                  element.hidden = !checkNoDependency(name)
                }

                if (errors && errors[name]) {
                  element.error = FormattedMethods.getFormattedError(name, { error: errors[name] })
                }
                expanded.push(element)
              })
              return expanded
            }
            // let expandedElements = expandElements(businessElements)
            // console.log(JSON.stringify(expandedElements, null, 2))

            routeInstanceFinal.values = values
            let nunjucksEnv = res.app.locals.settings.nunjucksEnv
            nunjucksEnv.addGlobal('getValue', (name, vals) => {
              return getFieldValue(name)
              // if (!vals) {
              //   vals = values
              // }
              // return values[name]
            })
            nunjucksEnv.addGlobal('getDisplayValue', (name, separator, vals) => {
              if (!vals) {
                vals = values
              }
              let value = getFieldValue(name)
              let output = getFieldValue(name)
              let options = FormattedMethods.getElementProp(name, 'options')
              if (options) {
                let type = FormattedMethods.getElementProp(name, 'type')
                if (type === 'radioGroup') {
                  options.forEach(opt => {
                    let optValue = FormattedMethods.getFormattedProp(opt, 'value')
                    if (optValue === value) {
                      output = FormattedMethods.getFormattedProp(opt, 'label')
                    }
                  })
                } else if (type === 'checkboxGroup') {
                  let yesses = []
                  options.forEach(opt => {
                    if (getFieldValue(opt)) {
                      yesses.push(FormattedMethods.getFormattedProp(opt, 'label'))
                    }
                  })
                  if (yesses.length) {
                    output = yesses.join(separator)
                  }
                }
              }
              if (output === undefined) {
                output = 'Not answered'
              }
              return output
            })

            Object.keys(FormattedMethods).forEach(key => {
              nunjucksEnv.addGlobal(key, FormattedMethods[key])
            })
            nunjucksEnv.addGlobal('getFieldValue', getFieldValue)
            nunjucksEnv.addGlobal('errors', errors)
            nunjucksEnv.addGlobal('autofields', autofields)
            nunjucksEnv.addGlobal('values', values)
            // nunjucksEnv.addGlobal('getRouteUrl', getRouteUrl)
            nunjucksEnv.addGlobal('checkNoDependency', checkNoDependency)
            nunjucksEnv.addGlobal('checkReveals', checkReveals)
            nunjucksEnv.addGlobal('checkRevealRequired', checkRevealRequired)
            nunjucksEnv.addGlobal('routeVisited', routeVisited)
            nunjucksEnv.addGlobal('app', appData)
            let counterStash = {}
            nunjucksEnv.addGlobal('counter', key => {
              key = key || 'default'
              counterStash[key] = counterStash[key] || 0
              return counterStash[key]++
            })


            nunjucksEnv.addGlobal('flags', flags)
            if (isFlowchart) {
              routeInstanceFinal.template = 'flowchart'
            }
            // if (isOutcome) {
            //   routeInstanceFinal.template = 'outcome'
            // }
            // console.log('overrides', overrides)

            let template = routeInstanceFinal.template
            if (!template && routeWizard) {
              if (routeInstanceFinal.start_page) {
                template = 'wizard-start'
              } else {
                template = getElementProp(routeInstanceFinal.wizard, 'stepTemplate')
                template = template || 'wizard-step'
              }
            }
            template = template || 'base'

            setTimeout(() => {
              res.render(`templates/${template}/${template}`, {
                route: routeInstanceFinal,
                savedfields: JSON.stringify(autofields, null, 2),
                autofields,
                wizard: routeWizard,
                visited: req.session.visited,
                accessCode,
                routesFlattened: routesFlattened,
                flowchart: isFlowchart,
                edit: isEdit,
                app: appData
              }, (err, rendered) => {
                if (err) {
                  // errorPage(err)
                } else {
                  res.send(rendered)
                  // TODO: GET ENV
                  if (process.env.ENV) {
                    let pagePath = req.originalUrl.replace(/^\//, '').replace(/\?.*/, '')
                    pagePath = (pagePath || 'index') + '.html'
                    let pageDir = pagePath.replace(/((.*\/)*).*/, '$1').replace(/\/$/, '')
                    mkdirp(path.resolve('public', 'html', pageDir), mkdirErr => {
                      if (mkdirErr) {
                        throw new Error(mkdirErr)
                      }
                      fs.writeFile(path.resolve('public', 'html', pagePath), rendered, writeFileErr => {
                        if (writeFileErr) {
                          logger(writeFileErr)
                        }
                      })
                    })
                  }
                }
              })
            }, 0)
          }
        })
        .catch(e => {
          logger('routes-metadata error', e)
          res.send('Something went wrong - sorry about that')
        })
    }
    routeHandler.isDynamicRoute = true
    router[method](url, routeHandler)
  })
}

registerRoutes()

module.exports = router
