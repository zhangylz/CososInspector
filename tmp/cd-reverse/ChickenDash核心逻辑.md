# ChickenDash 小鸡 · 相机 · 汽车核心逻辑分析

> **分析对象**：`casino-wbgame.jiligames.com/chickendash10000`（JILI gameId=748，Cocos Creator 3.8.5 Web 构建）
> **分析方法**：Inspector 场景快照（2245 节点）+ `assets/game/index.b7ec4.js`（437KB）反编译按类切分
> **反编译产物**：`tmp/cd-reverse/classes/`（44 个类）
> **快照**：`tmp/jiligames-scene-snapshot.json`

---

## 1. 全局架构

```text
Game(scene)
└─ Canvas › Common
   ├─ Controller                    ← 逻辑层（不渲染）
   │  ├─ FastEntry / DataMgr / GameMgr(网络) / GameCtrl(状态) / EffectMgr
   ├─ GameLayer › Stage
   │  ├─ Camera
   │  │  ├─ 2D Camera   (cc.Camera + CameraResize)  ← 世界相机，跟鸡走
   │  │  └─ UI Camera   (cc.Camera + CameraResize)  ← 界面相机，钉死不动
   │  ├─ Controller
   │  └─ Display › UI
   │     ├─ BGLayer (scale 0.84, pos -750,-50)
   │     │  ├─ bg_first (384×1600)
   │     │  ├─ roadItem-001 ~ 028 (每段 199×1600)
   │     │  │   └─ foot / coin_01~05 / odds_num / Roadblock / wheel(钱袋) / Cars / oddsTag
   │     │  └─ bg_end (384×1600)
   │     ├─ Character     ← 鸡本体（sp.Skeleton）
   │     ├─ Bonus_Character / Wheel(转轮奖励) / MineGame / EffectLayer / UILayer …
```

**核心设计：一切移动由服务器结果驱动，客户端只做演出。**

```text
玩家点 Jump
  → MineGame.goForward()
      currentStage==0 ? GameMgr.sendJump(bet, difficulty)   // protobuf S2C Jump
                      : GameMgr.sendContinue()
  ← S2U_SPIN_ACK (SpinAck.fromBinary): { win, targetStage, steps(1~3), wheelReward? }
  → MineGame.spinAck(win, targetStage, ...)
      ├─ 校验: 1 ≤ steps ≤ 3 且 targetStage ≤ roadNode.length，否则强制退出("Stage Error")
      ├─ steps>1（疾跑）: 沿途车辆 resetDrivingCar → 播 Chicken_Rush_01/02 → showSpeedDeclare 演出
      ├─ isDanger（险胜）: 该关车 playCarSound + delay 1s
      ├─ UICtrl.forwardRoad(targetStage, steps)      // 相机 1s tween
      ├─ UICtrl.characterMove(steps, isDanger, win)  // 鸡 Spine 跑动
      └─ 回调: 沿途段 setFinishStage → 当前段 setCurrentStage → 下一段 setNextStage
```

---

## 2. 难度数据（服务器下发）

`GameMgr` 收 paytable 协议后初始化（[038_GameCtrl.js]）：

```js
Game.difficultyRate = paytable.map(p => p.odds);          // 每难度一个倍率数组
Game.difficultyData = difficultyRate.map(e => ({ roundCnt: e.length })); // 关数 = 数组长度
// 快照实测: roundCnt = 28（roadItem-001 ~ 028）
```

钱袋关配置（`PropertyData`）：

```js
Game.coinAllStageSpecial = [[28], [19,22,24], [14,17,20]];  // 难度0/1/2 的钱袋关卡
Game.turboSpeed = 3;
```

---

## 3. 小鸡移动（`UICtrl` — [042_UICtrl.js]）

### 3.1 主方法 `characterMove(steps, isNearWin, isWin, cb)`

```js
characterMove(steps, isNearWin, isWin, cb) {
  tickChicken_count = -1;                    // 关闭逐帧 tick
  characterMoveCB = cb;
  // 目标位置 = 当前位置 + 路宽 × 步数
  target = characterNode.position.clone()
      .add(v3(isLandscape ? 167.16 : 199, 0, 0) * steps);

  const run = () => {
    if (steps == 1) playEffect("Chicken_Move");
    skeleton.timeScale = turboMode ? 1.5 : 3;         // 跑动动画 3 倍速
    playSpine(chicken, "Start"+steps, false, () => { // Spine 动画自带位移(root motion)
      skeleton.timeScale = turboMode ? 1/Game.turboSpeed : 1;
      if (isWin) {                                   // 安全过关
        playEffect("Chicken_Pass_0" + rand(1,2));
        characterNode.setPosition(target);           // 动画结束吸附到公式位
        playSpine(chicken, "Win"+rand(1,2), false, () => {
          characterShowIdle(); tickChicken_count = 0;
        });
      } else {                                       // 被撞
        tween(chicken).delay(0.18).call(() => {      // 0.18s 后撞车音效
          playEffect("Chicken_Fail_0" + rand(1,2));
          characterNode.setPosition(target);
          playSpine(chicken, "Hit"+steps, false, () => { tickChicken_count = 0; });
        }).start();
      }
      characterMoveCB && (characterMoveCB(), characterMoveCB = null);
    });
  };
  isNearWin                                             // 险胜: 先插播 NearWin
    ? (playEffect("Chicken_NearWin"), skeleton.timeScale = 1.5,
       playSpine(chicken, "NearWin", false, run))
    : run();
}
```

**要点**
- 鸡不用 tween 移动：位移烘焙在 Spine `Start1/Start2/Start3`（按步数选动画）里，动画播完 `setPosition` 吸附到精确公式位 → 快照里鸡 x=4329.64 非整数关位，正是抓到跑动中间帧
- `isNearWin` 来自该关车辆 `isDanger`（见 §5.3）：车压线的瞬间跳 = 播 NearWin 惊险演出；**多步跳(steps>1)强制豁免**
- turbo 模式：跑动 1.5 倍速（正常 3 倍），全局 `systemSpeed = turboSpeed`

### 3.2 复位 `characterResetPos()`

```js
// 开局/横竖屏切换/重开一局时调用
landscape: (-518, -20, 0) + (167.16 × currentStage, 0, 0)
portrait : (-199, -60, 0) + (199   × currentStage, 0, 0)
// 执行: Tween.stopAllByTarget + clearTracks + setToSetupPose + ShowIdle
```

### 3.3 Spine 动画状态机

| 动画 | 触发 | 说明 |
|---|---|---|
| `Idle` | 静止/复位 | 待机 |
| `Start1/2/3` | 每步移动 | root-motion 跑动，1/2/3 对应跳 1~3 段 |
| `NearWin` | isDanger 时 | 险胜前摇（1.5x） |
| `Win1/2` | isWin=true | 过关庆祝 |
| `Hit1/2` | isWin=false | 被车撞 |
| 另有 `characterNode2[]` | 多鸡彩蛋 | 最多 4 只额外鸡（`chickenBurn[]`），Win 时同台庆祝 |

---

## 4. 相机控制（`UICtrl` — [042_UICtrl.js]）

### 4.1 步进跟随 `forwardRoad(stage, steps)`

```js
forwardRoad(stage) {
  p = camera_2D.node.position.clone();
  p.x = (landscape ? 167.16 : 199) * stage + (landscape ? -150 : 0);
  if (stage == 0) p.x = 0;
  p.x = Math.min(p.x, getCameraLimit());
  tween(camera_2D.node).to(1, { position: p }).start();   // 固定 1 秒
}
getCameraLimit() {   // 道路尽头
  return landscape ? 167.16 * roundCnt + (-720)
                   : 199    * roundCnt + (-100);
}
```

**要点**
- 相机**不逐帧跟随鸡**，每步结果后 tween 一次到公式位（与鸡的公式同源，天然同步）
- 快照验证：相机 x=3960.48 = 167.16×28−720，**正好钳在横屏上限**（当时鸡已跑完 28 关全程）

### 4.2 玩家手动拖拽 `onTouchMove`

```js
// 按住可左右拖动查看整条路
p = camera_2D.node.position.clone();
p.x -= touchDelta.x;                 // 直接 setPosition，无 tween
p.x = clamp(p.x, 0, getCameraLimit());
```

### 4.3 其它相机入口

| 方法 | 行为 |
|---|---|
| `resetRoadCamera()` | 开新局：x 归 0，直接 setPosition |
| `discoverBag(stage)` | 竖屏钱袋特写：瞬移到钱袋段 → `Tween.stopAllByTarget` → tween 弹回 currentStage |
| `onRotation()` | 横竖屏切换：resetTopUI + resetRoadCamera + characterResetPos + 播 `stageUI_landscape/portrait` 布局动画 + Wheel 位置复位(横 -565,245/s0.84，竖 -315,270/s1) |
| `CameraResize` 组件 | 挂在两台相机上，按 `hypotenuse=-1` 自适应画幅 |

---

## 5. 汽车逻辑（`roadItem` — [041_roadItem.js]，每关路段一个实例）

### 5.1 数据表

```js
// 车型定义：皮肤 + 单趟穿行时长（秒）
carsDefine = {
  car1:{skin:"Car_01-1", driveTime:2},   car2:{skin:"Car_01-2", driveTime:2},
  car3:{skin:"Car_02-1", driveTime:1.2}, car4:{skin:"Car_05-2", driveTime:2},
  car5:{skin:"Car_03",   driveTime:0.5}, // 最快的车
  car6:{skin:"Car_02-2", driveTime:1.2}, car7:{skin:"Car_05-1", driveTime:1.2},
  car8:{skin:"Car_04-2", driveTime:2},   car9:{skin:"Car_04-1", driveTime:1.2},
};
carDelaySet    = [7, 6, 5, 4, 3];          // 难度0~4 的趟间等待（难度越高越密）
carDisplaySet  = [[1,2,3,1,2,3,4],[1,2,3,4,1,2,3,4,5],[3,4,5,6,7,8,9],[4,5,6,7,8,9],[5,5,6,7,8,9]];
               // 各难度可出现的车型池（难度越高车型越大越吓人）
carStopSet     = [[0,0,0,0,0,0,0,0,1,2],[0,0,0,0,0,0,1,1,2],[0,0,0,0,0,0,1,1,2],
                  [0,0,0,0,1,1,1,2,2,2],[0,0,0,1,1,1,2,2,2,2]];
               // 鸡到达该关时的急停演出掷点：0=无视 1=让开 2=急刹
```

### 5.2 循环穿行 `update(dt)`（`autoDriving=true` 时）

```js
update(dt) {
  if (!autoDriving) return;
  driveCount += dt;
  const car = carsDefine["car"+carIndex];
  if (driveCount > car.driveTime + carDelaySet[difficulty]) {
    // 上一趟结束 → 随机换车 → 从上往下再穿一趟
    driveCount = 0; isDanger = false;
    carIndex = pick(carDisplaySet[difficulty]);
    playCarAnime(carIndex);
    carsNode.setPosition(v3(0, 1000, 0));
    tween(carsNode).to(car.driveTime, { position: v3(0, -1000, 0) }).start();  // 竖直穿过 1600 高路段
  } else if (driveCount < 0.45*car.driveTime && driveCount > 0.1*car.driveTime) {
    isDanger = true;    // ★ 危险窗口：车正处于车道的 10%~45% 时间段（正压着鸡的横道）
  } else {
    isDanger = false;
  }
}
// init(odds) 时 driveCount = Math.random() * carDelaySet[difficulty] → 各关错峰
```

**isDanger 时间轴**（以 driveTime=1.2s 为例）：

```text
0 ──0.12s──[====危险====]──0.54s─────────────────1.2s──+delay──下一趟
           ↑ 10%~45%       车身压过鸡道
```

- 鸡移动前读 `roadNode[target-1].isDanger` 决定是否播 NearWin 演出
- **这个标志只影响演出**（NearWin/急刹），游戏结果由服务器 `SpinAck.win` 决定

### 5.3 鸡到达时急停演出（`setCurrentStage` 内）

```js
// 车从疾驰中停在鸡面前（险胜感）
const roll = pick(carStopSet[difficulty]);
if (roll == 2) tween(carsNode)
    .to(0.5, { position: v3(0, 600, 0) })           // 减速上抬
    .call(() => { playEffect("Car_Brakes"); playSpine(carsNode, "Stop"); })
    .to(0.1, { position: v3(0, 420, 0) }).start();  // 急停定格
else if (roll == 1) playSpine(carsNode, "Idle");    // 让开
// roll == 0: 不处理
// 同时: playSpine(blockNode, "Stop")，Roadblock 路障立起，显示该关倍率 playerOddsNode
```

### 5.4 段状态流转

| 方法 | 时机 | 效果 |
|---|---|---|
| `init(odds)` | 开局 | 激活该段、`autoDriving=true`、随机初始 driveCount 错峰、显示倍率 |
| `setNextStage()` | 成为下一关 | `setSymbol(3)` 预告符号 |
| `setCurrentStage(win, odds, isCoinBag)` | 鸡到达 | 急停演出 + Roadblock 立起 + 倍率标签 |
| `setFinishStage()` | 被跳过/结算 | `setSymbol(-1)`、显示脚印 foot、收钱袋触发 Wheel |
| `resetDrivingCar()` | 新回合/被跳过 | 车归位 y=1000、停止 autoDriving |

钱袋：`setFinishStage` 中若 `bagNode.active`（服务器指定的 `coinAllStageSpecial` 关卡）→ 播 MoneyBag_Get → 世界坐标经 `get3Dto2DPos(camera_2D, camera_UI)` 转屏幕坐标 → `getRoadWheel()` 飞向 Wheel → `showBonusStart` → `showWheelReward` 结算后回 BGM。

---

## 6. 常量表（`UICtrl` 模块级）与快照验证

| 常量 | 值 | 快照实测 |
|---|---|---|
| `roadWidth_portrait` | 199 | roadItem-001(x=483.5) → 002(x=682.5) 间距 199 ✓ |
| `roadWidth_landscape` | 167.16 | = 199 × 0.84(BGLayer scale) ✓ |
| `roadPadding_landscape` | -150 | — |
| `roadPadding_portrait` | 0 | — |
| `bgPadding_landscape` | -720 | 相机上限 167.16×28−720 = 3960.48 = 快照相机 x ✓ |
| `bgPadding_portrait` | -100 | — |
| 鸡复位原点(横/竖) | (-518,-20) / (-199,-60) | 鸡终点 ≈ -518+167.16×29 ≈ 4329 ✓ 快照 x=4329.64（跑动中帧） |
| 设计分辨率 | 1136×640 | Canvas ✓ |
| 快照模式判定 | Wheel(-565,245) s0.84 | = 横屏常量 → 快照为横屏态 ✓ |

---

## 7. 文件索引

| 文件 | 内容 |
|---|---|
| `tmp/cd-reverse/classes/038_GameCtrl.js` (106KB) | 主控：paytable 解析、SPIN_ACK 协议、SpinAck 派发 |
| `tmp/cd-reverse/classes/042_UICtrl.js` (33KB) | **相机 forwardRoad / 鸡 characterMove / 触摸拖拽 / 急停调用** |
| `tmp/cd-reverse/classes/041_roadItem.js` (9KB) | **汽车 update 循环 / isDanger 窗口 / 急停演出 / 段状态机** |
| `tmp/cd-reverse/classes/043_MineGame.js` (8KB) | 回合状态机：goForward / spinAck / cashOut / gameOver |
| `tmp/cd-reverse/classes/027_StepDeclare.js` (88KB) | 结算演出 |
| `tmp/cd-reverse/index.js` | 原始 bundle（437KB） |
| `tmp/jiligames-scene-snapshot.json` | 场景快照（2245 节点） |

---

## 8. 一句话总结

> 鸡的位移烘焙在 Spine 动画里、终点由 `roadWidth×stage` 公式锁定；相机只在每步结果后按同一公式 tween 1 秒（另有手动拖拽）；汽车是纯演出层 —— `update` 里按 `driveTime+carDelay` 循环竖直穿行，`10%~45%` 时间段标 `isDanger` 触发 NearWin/急刹演出，但**胜负早已由服务器 SpinAck 决定**。
