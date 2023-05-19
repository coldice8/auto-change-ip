# 自动检测和更换 Godaddy 域名关联的 ip（AWS VPS）

## 功能描述：

自动检测申请的 Godaddy 域名绑定的 ip 是否被墙，如果被墙，更换绑定的 ip，该脚本关联的服务器是 AWS Lightsail。

## 使用方法：

```bash
git clone https://github.com/coldice8/auto-change-ip.git
```

修改 config.js 文件里的参数。

创建 Godaddy 访问秘钥：https://developer.godaddy.com/keys 

创建 AWS 访问秘钥：https://console.aws.amazon.com/iam/home#/security_credentials

```bash
npm install
npm run dev
```

