const axios = require("axios");
const ping = require("net-ping");
const AWS = require('aws-sdk');
const dayjs = require("dayjs");
const config = require('./config');

let count = 1;

const godaddyInstance = axios.create({
  baseURL: config.godaddyUrl,
  timeout: config.godaddyTimeout,
  headers: { 'Authorization': `sso-key ${config.godaddyKey}:${config.godaddySecret}` } // 接口添加 Godaddy 的授权认证
});

/*
// 获取 Godaddy 授权账号下的所有域名
// 此处代码为了测试申请的认证是否能正常使用
godaddyInstance.get("/v1/domains").then(res => {
  if (res.status === 200) {
    console.log('====================================');
    console.log(res.data);
    console.log('====================================');
  }
}).catch(err => {
  console.error(err);
});

// 获取 AWS Lightsail 的某区域下是否有服务器实例
// 此处代码为了测试申请的认证是否能正常使用
const lightsail = new AWS.Lightsail({
  accessKeyId: config.AWSAccessKeyId,
  secretAccessKey: config.AWSSecretKey,
  region: 'us-west-2'
});
lightsail.getInstances({}, (err, data) => {
  if (err)
    console.error(err, err.stack); // an error occurred
  else
    console.log(data);           // successful response
});
*/

// 获取 Godaddy 某域名的 A 类型某名称对应的 ip
function getGodaddyDnsIp(dnsName) {
  return new Promise((resolve, reject) => {
    godaddyInstance.get(`/v1/domains/${config.domain}/records/A/${dnsName}`)
      .then(res => {
        if (res.status === 200) {
          const [{ data }] = res.data;
          resolve(data);
        }
        reject(res.response.statusText);
      })
      .catch(err => {
        const errText = err.code || (err.response && err.response.statusText)
        reject(`get godaddy domain ip failed: ${errText}`);
      });
  })
}

// 设置 Godaddy 某域名的 A 类型某名称对应的 ip
function setGodaddyDnsIp(vps) {
  return new Promise((resolve, reject) => {
    const params = [{
      "data": vps.domainIp,
      "ttl": 600,
    }];
    godaddyInstance.put(`/v1/domains/${config.domain}/records/A/${vps.dnsName}`, params)
      .then(res => {
        if (res.status === 200) {
          console.log(`替换域名 ${vps.dnsName} 对应的 ip ${vps.domainIp} 成功！`);
          resolve();
        }
        reject(res.response.statusText);
      })
      .catch(err => {
        const errText = err.code || (err.response && err.response.statusText)
        reject(`set godaddy domain ip failed: ${errText}`);
      });
  })
}

// 删除关联的 ip，分配新 ip，并关联绑定服务器实例
function operationStaticIp(vps) {
  return new Promise((resolve, reject) => {
    const lightsail = new AWS.Lightsail({
      accessKeyId: config.AWSAccessKeyId,
      secretAccessKey: config.AWSSecretKey,
      region: vps.region
    });
    lightsail.releaseStaticIp({ staticIpName: vps.staticIpName }, (err, data) => {
      if (!err || err.code === "NotFoundException") {
        console.log(`删除 VPS ${vps.instanceName} 旧的静态 IP 成功！`);
        lightsail.allocateStaticIp({ staticIpName: vps.staticIpName }, (err, data) => {
          if (!err) {
            console.log(`分配 VPS ${vps.instanceName} 新的静态 IP 成功！`);
            lightsail.attachStaticIp({ instanceName: vps.instanceName, staticIpName: vps.staticIpName }, (err, data) => {
              if (!err) {
                console.log(`VPS ${vps.instanceName} 新 IP 绑定成功！`);
                resolve();
              } else {
                reject(err.code);
              }
            })
          } else {
            reject(err.code);
          }
        });
      } else {
        reject(err.code);
      }
    });
  })
}

// 获取 AWS 服务器实例绑定的静态 ip
function getAWSLightsailVpsIp(vps) {
  return new Promise((resolve, reject) => {
    const lightsail = new AWS.Lightsail({
      accessKeyId: config.AWSAccessKeyId,
      secretAccessKey: config.AWSSecretKey,
      region: vps.region
    });
    lightsail.getStaticIp({ staticIpName: vps.staticIpName }, function (err, data) {
      if (!err) {
        const { staticIp: { ipAddress } } = data;
        resolve(ipAddress);
      } else if (err.code === "NotFoundException") {
        resolve();
      } else {
        reject(err.code);
      }
    })
  })
}

/**
 * 检查 ip 是否已经被封锁
 * @param {string} ip 
 */
function checkIpWork(ip) {
  return new Promise((resolve, reject) => {
    const options = {
      networkProtocol: ping.NetworkProtocol.IPv4,
      packetSize: 16,
      retries: config.pingRetries,
      // sessionId: (process.pid % 65535),
      sessionId: Math.round(Math.random() * 65535),
      timeout: config.pingTimeout,
      ttl: 128
    };
    const session = ping.createSession(options);
    session.pingHost(ip, (error, target) => {
      if (error) {
        if (error instanceof ping.RequestTimedOutError) {
          resolve(false);
        } else {
          reject(error.toString());
        }
      }
      else {
        resolve(true);
      }
    });
  })
}

async function getVpsIpAndChangeDomainIp(vps) {
  try {
    const vpsIp = await getAWSLightsailVpsIp(vps);
    console.log(`VPS ${vps.instanceName} ip: ${vpsIp}`);
    if (vpsIp && vpsIp !== vps.domainIp) {
      const isConnected = await checkIpWork(vpsIp);
      if (isConnected) {
        const newVps = { ...vps, domainIp: vpsIp };
        await setGodaddyDnsIp(newVps);
        return;
      }
    }
    await operationStaticIp(vps);
    await getVpsIpAndChangeDomainIp(vps);
  } catch (err) {
    console.error(err);
  }
}

// 检查服务器列表里 Godaddy 域名对应的 ip 是否被封，如果被封，更换 ip
async function checkVpsListAndChangeIp() {
  for (let vps of config.vpsList) {
    try {
      const domainIp = await getGodaddyDnsIp(vps.dnsName);
      const isConnected = await checkIpWork(domainIp);
      if (!isConnected) {
        console.log(`Domain ${vps.dnsName} ${domainIp}: Blocked`);
        const newVps = { ...vps, domainIp };
        await getVpsIpAndChangeDomainIp(newVps);
      } else {
        console.log(`Domain ${vps.dnsName} ${domainIp}: Alive`);
      }
    } catch (err) {
      console.error(err);
    }
  }
  console.log(`============== 第 ${count++} 次检测完毕 ${dayjs().format('YYYY-MM-DD HH:mm:ss')} ==============`);
}

console.log(`============== 检测开始 ${dayjs().format('YYYY-MM-DD HH:mm:ss')} ==============`);
checkVpsListAndChangeIp();
setInterval(() => {
  checkVpsListAndChangeIp();
}, config.cycleTime)
