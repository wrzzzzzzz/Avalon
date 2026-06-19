# Multiplayer Game Template

一个完整的全栈多人游戏项目模板，使用 MERN 技术栈（MongoDB + Express + React + Node.js）和 Socket.io 实现实时多人游戏功能。

## 项目结构

```
├── game-client/          # React 前端应用
│   ├── public/          # 静态文件
│   ├── src/             # 源代码
│   │   ├── components/  # React 组件
│   │   ├── contexts/    # React Context (Auth, Socket)
│   │   ├── hooks/       # 自定义 Hooks
│   │   ├── pages/       # 页面组件
│   │   └── App.js       # 主应用组件
│   ├── package.json
│   └── README.md
│
├── game-server/          # Express 后端服务
│   ├── controllers/     # 路由控制器
│   ├── db/              # 数据库连接
│   ├── middleware/      # 中间件 (认证等)
│   ├── models/          # MongoDB 模型
│   ├── routes/          # API 路由
│   ├── services/        # 业务逻辑服务
│   ├── static/          # 静态文件存储
│   ├── server.js        # 服务器入口
│   ├── package.json
│   └── .gitignore
│
├── .gitignore
└── README.md
```

## 技术栈

### 前端 (game-client)
- React 18
- React Router DOM
- Socket.io Client
- Axios
- Context API

### 后端 (game-server)
- Node.js
- Express
- Socket.io
- MongoDB (Mongoose)
- JWT 认证
- bcryptjs

## 功能特性

✅ 用户认证系统（注册/登录）
✅ 游戏房间创建和加入
✅ 实时多人游戏通信（Socket.io）
✅ 用户资料和统计数据
✅ 游戏状态管理
✅ RESTful API
✅ WebSocket 实时事件

## 快速开始

### 前置要求

- Node.js (v14 或更高版本)
- MongoDB (本地安装或 MongoDB Atlas)
- npm 或 yarn

### 安装步骤

1. **克隆或使用此模板**

2. **安装服务端依赖**
```bash
cd game-server
npm install
```

3. **安装客户端依赖**
```bash
cd ../game-client
npm install
```

4. **配置环境变量**

在 `game-server` 目录创建 `.env` 文件：
```env
PORT=5000
CLIENT_URL=http://localhost:3000
MONGODB_URI=mongodb://localhost:27017/game-db
JWT_SECRET=your-secret-key-here
NODE_ENV=development
```

在 `game-client` 目录创建 `.env` 文件：
```env
REACT_APP_API_URL=http://localhost:5000
REACT_APP_SOCKET_URL=http://localhost:5000
```

5. **启动 MongoDB**

确保 MongoDB 服务正在运行。如果使用本地 MongoDB：
```bash
# Windows
net start MongoDB

# macOS/Linux
sudo systemctl start mongod
```

6. **启动服务端**
```bash
cd game-server
npm run dev  # 或 npm start
```

服务端将在 http://localhost:5000 运行

7. **启动客户端**
```bash
cd game-client
npm start
```

客户端将在 http://localhost:3000 运行

## API 端点

### 认证
- `POST /api/auth/register` - 注册新用户
- `POST /api/auth/login` - 用户登录
- `POST /api/auth/logout` - 用户登出

### 游戏
- `GET /api/game` - 获取所有游戏房间
- `GET /api/game/:gameId` - 获取特定游戏详情
- `POST /api/game/create` - 创建新游戏房间
- `POST /api/game/:gameId/join` - 加入游戏房间
- `POST /api/game/:gameId/leave` - 离开游戏房间

### 用户
- `GET /api/user/profile` - 获取用户资料
- `PUT /api/user/profile` - 更新用户资料
- `GET /api/user/stats` - 获取用户统计数据

## Socket.io 事件

### 客户端 → 服务器
- `join-game` - 加入游戏房间
- `leave-game` - 离开游戏房间
- `game-action` - 发送游戏动作

### 服务器 → 客户端
- `player-joined` - 玩家加入房间
- `player-left` - 玩家离开房间
- `game-update` - 游戏状态更新

## 开发指南

### 添加新的游戏逻辑

1. 在 `game-server/services/gameService.js` 中实现游戏逻辑
2. 在 `game-server/models/Game.js` 中扩展游戏状态模型
3. 在 `game-client/src/pages/GameRoom.js` 中添加游戏 UI

### 添加新的 API 路由

1. 在 `game-server/routes/` 创建或修改路由文件
2. 在 `game-server/controllers/` 创建对应的控制器
3. 在 `server.js` 中注册路由

## 项目扩展建议

- [ ] 添加游戏类型（棋类、卡牌、实时对战等）
- [ ] 实现游戏回放功能
- [ ] 添加排行榜系统
- [ ] 实现聊天功能
- [ ] 添加好友系统
- [ ] 实现游戏大厅
- [ ] 添加单元测试和集成测试
- [ ] 优化游戏性能
- [ ] 添加移动端适配

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！