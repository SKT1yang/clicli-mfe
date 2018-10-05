const Router = require('koa-router')
const path = require('path')
const fs = require('fs')
const axios = require('axios')

const parser = require('./parser')

const VueServerRenderer = require('vue-server-renderer')
const clientManifest = require('../dist/vue-ssr-client-manifest.json')

const bundle = require('../dist/server-build.js').default
const template = fs.readFileSync(
  path.join(__dirname, './template.html'),
  'utf-8'
)
const renderer = VueServerRenderer.createRenderer({
  template,
  clientManifest
})

const router = new Router()

// 解析嘀哩嘀哩和halihali
router.get('/jx/', async ctx => {
  let url = ctx.query.url
  let type = parser.urlType(url)
  switch (type) {
    case 'bilibili':
      let ob
      if (url.indexOf('av') < 0) {
        url = url.replace('www.', 'm.')

        ob = await axios.get(url).then(res => {
          let cid, aid

          cid = res.data.match(/cid(\S*)cover/)
          aid = res.data.match(/aid(\S*)cid/)

          if (cid) {
            return {
              a: aid[1].substring(2, aid[1].length - 2),
              c: cid[1].substring(2, cid[1].length - 2)
            }
          }
        })
      } else {
        url = url + '/'
        let aid = url.match(/av(\S+?)\//)[1].replace('/', '')
        ob = await axios.get('https://api.bilibili.com/x/web-interface/view', {
          params: {
            aid
          }
        }).then(res => {
          let p2 = res.data.data.pages
          if (p2.length > 1) {
            p2 = res.data.data.pages[1].cid
          }
          return {
            a: aid,
            c: res.data.data.cid,
            p2
          }
        })
      }
      let ep, av
      if (url.indexOf('av') < 0) {
        ep = await axios.get(`https://www.kanbilibili.com/api/video/${ob.a}/download`, {
          params: {
            cid: ob.c,
            quality: 16,
            page: 1,
            bangumi: 1
          },
          headers: {
            Host: 'www.kanbilibili.com'
          }
        }).then(res => {
          return res.data.data.durl[0].url.replace('http', 'https')
        })
      } else {
        if (url.indexOf('p=') < 0) {
          av = await axios.get('https://api.bilibili.com/x/player/playurl', {
            params: {
              cid: ob.c,
              avid: ob.a,
              platform: 'html5',
              otype: 'json',
              qn: 16,
              type: 'mp4'
            },
            headers: {
              Host: 'api.bilibili.com',
            }
          }).then(res => {
            return res.data.data.durl[0].url.replace('http', 'https')
          })
        } else {
          let p = url.match(/p=(\S*)/)[1]
          av = await axios.get(`https://www.kanbilibili.com/api/video/${ob.a}/download`, {
            params: {
              cid: ob.p2 ? ob.p2 : ob.c,
              quality: 16,
              page: p ? p : 1
            },
            headers: {
              Host: 'www.kanbilibili.com'
            }
          }).then(res => {
            return res.data.data.durl[0].url.replace('http', 'https')
          })
        }

      }


      ctx.body = {
        code: 0,
        aid: ob.a,
        cid: ob.c,
        url: url.indexOf('av') < 0 ? ep : av,
        type: 'mp4'
      }
      break
    case 'dilidili':
      await axios.get(url).then(res => {
        let dili = res.data.match(/vd3.bdstatic.com(\S*)mp4/)
        if (dili) {
          let str = dili[0].replace(/\\\//g, '/')
          ctx.body = {
            code: 0,
            url: `https://${str}`,
            type: 'mp4'
          }
        }
      })
      break
    case 'qq':
      url = url.substring(url.length - 16, url.length - 5)
      const qqv = await axios.get(`http://vv.video.qq.com/getinfo`, {
        headers: {
          'X-Forwarded-For': '183.3.226.35'
        },
        params: {
          vids: url,
          platform: 101001,
          charge: 0,
          otype: 'json'
        }
      }).then(res => {
        let data = res.data.substring(13, res.data.length - 1)
        data = JSON.parse(data)
        return {
          pre: data.vl.vi[0].ul,
          vid: data.vl.vi[0].vid
        }

      })

      await axios.get('http://vv.video.qq.com/getkey', {
        headers: {
          'X-Forwarded-For': '183.3.226.35'
        },
        params: {
          format: 2,
          otype: 'json',
          vt: 150,
          vid: qqv.vid,
          filename: qqv.vid + '.mp4',
          change: 0,
          platform: '11'
        }
      }).then(res => {
        let data = res.data.substring(13, res.data.length - 1)
        data = JSON.parse(data)
        let fn = data.filename
        let key = data.key

        ctx.body = {
          code: 0,
          url: `http://221.7.255.177/cache.p4p.com/${fn}?vkey=${key}`,
          type: 'mp4'
        }
      })
      break
    case 'qinmei':
      const out = await axios.get(url).then(res => {
        return res.data.match(/url: '(\S+?)'/)[1]
      })
      ctx.body = {
        code: 0,
        url: out
      }
      break
    case 'hcy':
      axios.get(url).then(res => {
        let out = res.data.match(/download(\S*);/)
        let u = out[0].substring(0, out[0].length - 2)

        ctx.body = {
          code: 0,
          url: `https://${u}`,
          type: 'mp4'
        }
      })
      break
    default:
      ctx.body = {
        code: 0,
        url,
        type: url.indexOf('m3u8') < 0 ? 'mp4' : 'hls'
      }
  }
})

router.get('*', async ctx => {
  ctx.type = 'html'
  const cookie = ctx.cookies.get('uname')
  if (cookie) {
    let data = fs.readFileSync(path.join(__dirname, '../dist/spa/index.html'))
    ctx.body = data.toString()
  } else {
    const context = {
      url: ctx.path
    }
    try {
      const app = await bundle(context)

      const appString = await renderer.renderToString(app, context)

      ctx.body = appString
    } catch (err) {
      console.log('render error', err)
      throw err
    }
  }
})
module.exports = router
