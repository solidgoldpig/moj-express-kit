const path = require('path')
const express = require('express')

// Express middleware
const session = require('express-session')
const bodyParser = require('body-parser')
const cookieParser = require('cookie-parser')
const morgan = require('morgan')
const favicon = require('serve-favicon')
const compression = require('compression')

const constants = require('./constants')

const { ENV, PORT, ASSET_PATH, ASSET_SRC_PATH } = constants

const logger = require('./logger')
const auth = require('./auth')

const ping = require('./middleware/ping')
const healthcheck = require('./middleware/healthcheck')
const robotsTesting = require('./middleware/robots-testing')
const robotsDisallow = require('./middleware/robots-disallow')
const locals = require('./middleware/locals')
const routesStatic = require('./middleware/routes-static')
const routesNunjucks = require('./middleware/routes-nunjucks')
const errorHandler = require('./middleware/error-handler')

const nunjucksConfigure = require('./nunjucks-configure')

const start = (options = {}) => {
  const appDir = process.cwd()
  const kitLibDir = __dirname
  const kitDir = path.resolve(kitLibDir, '..')

  const routesMetadata = require('./routes-metadata.js')

  // NB. not to be confused with assetSrcPath

  const app = express()
  app.disable('x-powered-by')

  // Set views engine
  app.set('view engine', 'html')

  // Configure nunjucks
  nunjucksConfigure(app, appDir, kitDir)

  // Configure logging
  const loggingPreset = ENV ? 'combined' : 'dev'
  app.use(morgan(loggingPreset, {
    skip: () => ENV === 'test'
  }))

  // Set Favicon
  app.use(favicon(path.join(appDir, 'node_modules', 'govuk_frontend_alpha', 'assets', 'images', 'template', 'favicon.ico')))

  // Ping route
  app.use(ping.init())

  // Healthcheck route
  app.use(healthcheck.init(options.validateHealthcheck))

  // Disable indexing of svgs
  // https://github.com/18F/pa11y-crawl/issues/4
  if (!ENV || ENV === 'testing') {
    app.use(robotsTesting())
  }

  // Disable indexing of service
  if (ENV === 'prod' || ENV === 'staging' || ENV === 'dev' || ENV === 'private-beta') {
    app.use(robotsDisallow())
  }

  // Gzip content
  app.use(compression())

  // Support session data
  // TODO: LOOK TO FIX THIS UP
  app.use(session({
    resave: false,
    saveUninitialized: false,
    secret: Math.round(Math.random() * 100000).toString()
  }))

  // Support for parsing data in POSTs
  app.use(bodyParser.json())
  app.use(bodyParser.urlencoded({
    extended: true
  }))

  // Enable reading of cookies
  app.use(cookieParser())

  // Local values
  app.use(locals(ENV, ASSET_PATH, process.env))

  // Run everything through basic auth
  app.use(auth(options.basicAuth))

  // TODO: remove need for this TERRIBLE kludge
  // allows other routes to use the format and block methods
  // This needs to be here to cater for any dynamic routes called before we hit the static ones
  app.use(routesMetadata.globalMethods)

  // Screen users if necessary
  if (options.screenUsers) {
    app.use(options.screenUsers(ENV))
  }

  // Middleware to serve static assets
  app.use(routesStatic(appDir, kitDir, ASSET_PATH, ASSET_SRC_PATH))

  // Metadata-based routes
  // TODO: turn routesMetadata into a method
  app.use(routesMetadata())

  // Simple nunjucks routes
  app.use(routesNunjucks())

  // if we got here it's not found
  app.use((res, req) => {
    errorHandler.render(res, req, 404)
  })

  // Handle any errors
  app.use(errorHandler.handle)

  // Fire up the app
  const server = app.listen(PORT, () => {
    logger('App is running on localhost:' + PORT)
    if (options.callback) {
      options.callback(server, app)
    }
  })
}

module.exports = {
  start
}
