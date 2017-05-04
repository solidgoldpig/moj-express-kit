const fs = require('fs')
const path = require('path')
const express = require('express')
const nunjucks = require('nunjucks')
const request = require('request-promise-native')

// Express middleware
const session = require('express-session')
const bodyParser = require('body-parser')
const cookieParser = require('cookie-parser')
const morgan = require('morgan')
const favicon = require('serve-favicon')
const compression = require('compression')

const logger = require('./lib/logger')
const auth = require('./lib/auth')

const appDir = process.cwd()
const kitDir = __dirname
// const config = require(path.join(appDir, 'config.js'))
const packageJson = require(path.join(appDir, 'package.json'))

// const rootDir = path.join(__dirname, '..')
const getDistPath = (srcDir = '') => path.join(appDir, 'public', srcDir)

const ENV = process.env.ENV
const PORT = process.env.PORT || 3000

// UH HUH???? LOOKS A BIT RUBBISH
if (!ENV || ENV === 'a11y') {
  // try {
  //   fs.unlinkSync(getDistPath('robots.txt'))
  // } catch (e) {}
}

const routes = require('./lib/routes-metadata.js')

const assetPath = 'public'
// NB. not to be confused with assetSrcPath

const app = express()
app.disable('x-powered-by')

// Set views engine
app.set('view engine', 'html')

// Support for parsing data in POSTs
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({
  extended: true
}))

// Support session data
// TODO: LOOK TO FIX THIS UP
app.use(session({
  resave: false,
  saveUninitialized: false,
  secret: Math.round(Math.random() * 100000).toString()
}))

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST')
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, content-type, Authorization')
  res.setHeader('X-Robots-Tag', 'noindex,nofollow')
  next()
})

const loggingPreset = ENV ? 'combined' : 'dev'
app.use(morgan(loggingPreset, {
  skip: () => ENV === 'test'
}))

// Gzip content
app.use(compression())




const { APP_VERSION, APP_BUILD_DATE, APP_GIT_COMMIT, APP_BUILD_TAG } = process.env
app.use('/ping.json', (req, res) => {
  res.json({
    version_number: APP_VERSION,
    build_date: APP_BUILD_DATE,
    commit_id: APP_GIT_COMMIT,
    build_tag: APP_BUILD_TAG
  })
})

const checkValidResponse = html => {
  const indexJson = { title: 'Get help with child arrangements'} // require('../data/index.json')
  const indexMatch = new RegExp(`<h1[^>]*>${indexJson.title}</h1>`)
  return !!html.match(indexMatch)
} 

app.use('/healthcheck.json', (req, res) => {
  let status = true
  let statusCode
  request(`http://localhost:${PORT}`)
    .then(html => {
      statusCode = 200
      if (checkValidResponse) {
        status = checkValidResponse(html)
      }
    })
    .catch(err => {
      status = false
      statusCode = err.statusCode
    })
    .then(() => {
      res.status(status ? 200 : 500)
      res.json({
        status,
        content: {
          statusCode
        }
      })
    })
})


// Set Favicon
app.use(favicon(path.join(appDir, 'node_modules', 'govuk_frontend_alpha', 'assets', 'images', 'template', 'favicon.ico')))
//node_modules/govuk_frontend_alpha/assets/images/template/favicon.ico
// app.use(favicon(getDistPath('static/images/site-icons/favicon.ico')))

// Enable reading of cookies
app.use(cookieParser())

// Run everything through basic auth
app.use(auth)


// Shut out users who have not come via private beta
if (!ENV || ENV === 'prod' || ENV === 'staging' || ENV === 'private-beta') {
  const disqualifiedUser = (req, code = 403) => {
    req.disqualified = true
    throw new Error(code)
  }
  app.get('/sorry', req => disqualifiedUser(req, 401))
  app.get('/revisit', (req, res) => {
    if (!req.cookies || !req.cookies.surveyData) {
      const surveyCookie = {
        campaignName: 'private-beta-cla',
        uuid: req.query.uuid,
        visited: {}
      }
      for (var q in req.query) {
        if (q !== 'uuid') {
          surveyCookie.visited[q] = true
        }
      }
      res.cookie('surveyData', JSON.stringify(surveyCookie))
    }
    res.redirect('/')
  })
  app.use((req, res, next) => {
    if (req.connection.remoteAddress.includes('127.0.0.1')) {
      return next()
    }
    if (!req.url.match(/\.(css|js)/)) {
      if (!req.cookies || !req.cookies.surveyData) {
        let referrer = req.query.referrer
        let uuid = req.query.uuid
        if (!referrer || !referrer.includes('private-beta-cla') || !uuid) {
          disqualifiedUser(req)
        }
        res.cookie('surveyData', JSON.stringify({
          campaignName: 'private-beta-cla',
          uuid
        }))
        if (req.url.includes('/landing')) {
          res.redirect('/accepted')
        }
      }
    }
    return next()
  })
}


var appViews = [
  path.join(appDir, 'app'),
  path.join(kitDir, 'app'),
  path.join(appDir, 'node_modules', 'govuk_frontend_alpha'),
  // why components too?
  path.join(appDir, 'node_modules', 'govuk_frontend_alpha', 'components')
]
// app.set('views', appViews)

var nunjucksAppEnv = nunjucks.configure(appViews, {
  autoescape: true,
  express: app,
  noCache: true,
  watch: true
})


// send assetPath to all views
// NB. more vars set up later on
app.use(function (req, res, next) {
  res.locals.asset_path = `/${assetPath}/`
  next()
})


function TurnipExtension() {
    this.tags = ['turnip'];

    this.parse = function(parser, nodes, lexer) {
        // get the tag token
        var tok = parser.nextToken();

        // parse the args and move after the block end. passing true
        // as the second arg is required if there are no parentheses
        var args = parser.parseSignature(null, true);
        parser.advanceAfterBlockEnd(tok.value);

        // parse the body and possibly the error block, which is optional
        var body = parser.parseUntilBlocks('error', 'endturnip');
        var errorBody = null;

        if(parser.skipSymbol('error')) {
            parser.skip(lexer.TOKEN_BLOCK_END);
            errorBody = parser.parseUntilBlocks('endturnip');
        }

        parser.advanceAfterBlockEnd();

        // See above for notes about CallExtension
        return new nodes.CallExtension(this, 'run', args, [body, errorBody]);
    };

    this.run = function(context, url, body, errorBody) {
        // console.log(context.ctx.govuk.button.toString())
        // console.log(context.globals)
        // console.log(context._globals)
        // console.log(this)
        var id = 'el' + Math.floor(Math.random() * 10000);
        var ret = new nunjucks.runtime.SafeString('<div id="' + id + '">' + url + body() +  context.ctx.woot + '</div>');
        ret = new nunjucks.runtime.SafeString(nunjucks.renderString('<div id="{{ id }}">{{ url }} - {{ body }} , Hello {{ username }}, {{ woot }}, {{ macros.Pish() }} {{ govuk.button(text="shonk") }}</div>', Object.assign({ username: 'James', id, url, body:body() }, context.ctx)))

        return ret;
    };
}

nunjucksAppEnv.addExtension('TurnipExtension', new TurnipExtension());


// app.use(njk.ctxProc([
//   reqCtxProcessor
// ]))
  // assetsCtxProcessor    
nunjucksAppEnv.addGlobal('macros', {})
nunjucksAppEnv.addGlobal('Object', Object)
nunjucksAppEnv.addGlobal('objectAssign', (...args) => {
  // console.log('ctx', this)
  // Object.assign(this.ctx, args[1])
  Object.assign.apply(null, args)
})
nunjucksAppEnv.addGlobal('setCtx', function(key, val) { 
  this.ctx[key] = val
})
nunjucksAppEnv.addGlobal('setGlobal', function(key, val) { 
  nunjucksAppEnv.addGlobal(key, val)
})
nunjucksAppEnv.addGlobal('getCtx', function() { 
  return this.ctx
})
nunjucksAppEnv.addFilter('json', JSON.stringify)

// Middleware to serve static assets
const assetSrcPath = `/public`
app.use(assetSrcPath, express.static(path.join(appDir, assetPath)))
app.use(assetSrcPath, express.static(path.join(appDir, 'app', 'assets')))
app.use(assetSrcPath, express.static(path.join(kitDir, 'app', 'assets')))
app.use(assetSrcPath, express.static(path.join(appDir, 'node_modules', 'govuk_frontend_alpha', 'assets')))


// SET US UP SOME BEASTIES
app.use((req, res, next) => {
  res.locals.ENV = ENV
  res.locals.env = process.env
  req.ENV = ENV
  req.env = process.env
  req.servername = (ENV ? 'https' : 'http') + '://' + req.headers.host
  next()
})

app.use('/', routes);

const context = { woot: 'w00t!', gobble:'explicit gobble', xasset_path:'/xpublic/'}

app.get(/^\/([^.]+)$/, (req, res, next) => {
  var path = 'templates/' + (req.params[0])
  res.render(path, context, function (err, html) {
    if (err) {
      res.render(path + '/index', context, function (err2, html) {
        if (err2) {
          // res.status(404).send(`${req.originalUrl} not found`)
          next()
          return
        } else {
          res.send(html)
        }
      })
    } else {
      res.send(html)
    }
  })
})



// ALREADY GOT ONE, BUT OOOH EXTENSIONS
// Set a static files folder (css, images etc...)
app.use('/', express.static(getDistPath(), {
  index: ['index.html'],
  extensions: ['html']
}))


// ALREADY GOT ONE
// app.use('/', routes)

const { GA_TRACKING_ID } = process.env

function errorRender (req, res, errCode) {

  const route = {
    id: errCode
  }

  res.status(errCode)
  res.render(`templates/error/${errCode}`, {
    route,
    errCode
  })
}
function errorHandler (err, req, res, next) {
  if (res.headersSent) {
    return next(err)
  }
  if (err) {
    logger(err)
    let errCode = Number(err.message.toString())
    if (isNaN(errCode) || errCode > 500) {
      errCode = 500
    }
    errorRender (req, res, errCode)
  }
}

app.use((res, req, next) => {
  // if we got here it's not found
  errorRender(res, req, 404)
})

app.use(errorHandler)



app.listen(PORT);
logger('CAIT is running on localhost:' + PORT)