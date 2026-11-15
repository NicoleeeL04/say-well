# 现成人体 + 网页三维涂色

## 使用

把整个 skin-paint-ready 文件夹放到现有网页项目的静态目录（例如 public/skin-paint-ready）。访问 /skin-paint-ready/index.html 即可使用。

也可以嵌入：

    <iframe src="/skin-paint-ready/index.html"
      title="三维身体涂色"
      style="width:100%;height:1150px;border:0"></iframe>

独立预览需要本地 HTTP 服务（ES modules / GLB 加载不能直接双击 HTML）：

    cd skin-paint-ready
    python3 -m http.server 8080

打开 http://localhost:8080。所有库和模型均在包内，无需 API key、后端或外网。运行不需要 Blender。

## 交互

- 左键/单指拖动，在三维皮肤表面涂色。
- 右键拖动旋转，或使用“自由旋转”模式；支持任意方向翻转，围绕人体中心旋转。正/背/侧/俯视/仰视按钮可快速归位。滚轮缩放。
- 笔刷圆环跟随三维表面；笔迹存入 2048×2048 皮肤纹理，跨 UV 三角形绘制，随模型旋转与骨骼动作保持附着。
- 画笔大小、3 种颜色、橡皮擦、最近 5 步撤销、清空。
- 左右臂滑杆使用原模型骨骼权重；0° 表示原始 A 形绑定姿势，不是手臂垂直下垂或临床测量角度。
- 当前页面内保存标记；刷新清空。未自动上传到任何服务器。

## 接入保存

模型加载完成后，组件元素暴露 skinPaint 接口：

    const component = document.getElementById('skin-paint').skinPaint;
    const data = component.getState();
    // data 包含 version:2、left/right、PNG 纹理 data URL、strokeCount
    await component.setState(data);

iframe 同源时可通过 iframe.contentDocument 查找该元素。Version 2 标记仅适用于这一模型的 UV；与上一版顶点颜色存档不兼容。

主要文件：
- index.html：界面、import map
- app.js：模型加载、骨骼抬臂、三维刷子到 UV 纹理的投影与交互
- human.glb：现成的带蒙皮骨骼与 UV 人体
- three.module.js / GLTFLoader.js / BufferGeometryUtils.js：本地 Three.js r160 依赖

## 来源和边界

模型：Innerscene “Human base mesh with editable 53-bone rig”，基于 MakeHuman / MPFB，来源页标明 CC0。
https://www.innerscene.com/tools/library/3d-parts/human-base-mesh-with-editable-53-bone-rig-8e7c8ab1

许可：https://creativecommons.org/publicdomain/zero/1.0/
Three.js：MIT，见 THREE-LICENSE.txt。

本版保留源 GLB，替换显示材质并叠加可编辑的皮肤纹理；53 根源骨骼中当前只提供双侧上臂控制。是身体位置沟通原型，未经医学测量验证，不提供诊断或防碰撞仿真。手指缝等狭小区域和极端姿势仍可能需要进一步交互优化。

## 画笔性能更新

- 用可随姿势更新的 BVH 与缓存蒙皮位置进行命中检测。
- 使用空间网格只处理笔刷附近的 UV 三角形。
- 鼠标移动按显示帧合并，抬笔时补齐最后一段；同帧仅渲染一次。
- 保留原模型与 2048×2048 涂色纹理，关闭每次绘制时不必要的 mipmap 生成。

## Say Well integration

`index.html` is now the three-stage Say Well app. Use `painter.html` for standalone embedding (replace the old iframe URL above). Existing `getState()` / `setState()` behavior is preserved. Two additional methods are available after loading:

```js
component.markRegions([{ region: 'knee', side: 'left' }]);
const png = component.snapshot();
```

`markRegions` replaces the current drawing with approximate surface areas and adds an undo entry. Left/right refer to the patient's perspective; side may also be `both` or `unspecified`. The supported 24 regions are exported in `regions.js`, including wrist, ankle, elbow, upper/lower back, and upper/lower abdomen. An optional `surface` is `front`, `back`, or `unspecified`. Selection uses skeleton bone ownership plus normalized coordinates. `markRegions` returns `{marked, missing, triangles}`; the UI reports any unpaintable suggestion. This mapping is approximate. It does not interpret freehand strokes as clinical locations. `snapshot()` returns a PNG data URL of the current view for local export.

`getInfo()` returns cheap stroke/revision metadata. `setReadOnly(true)` allows rotation while preventing drawing edits in the final review. The root emits `skinpaint-ready` and `paintchange` events so the host can wait for loading and invalidate confirmation after manual edits.

## 人体 / 牙科切换

症状沟通页的 3D 模型区域提供 **Body / 人体** 与 **Dental / 牙科** 切换。牙科模型通过同源 iframe 隔离 Three.js 和样式，首次切换时才加载，隐藏时停止渲染。切换保留两个模型在本页中的标记；刷新清空。

牙科支持“仅牙齿”和“牙齿＋对应牙龈”，每颗牙分别保留选择范围；点击牙龈只关联对应局部区域。修改后需要重新确认，在最终回顾步骤禁止修改标记。摘要和下载包含牙位编号及是否包含牙龈；下载截图使用当前选择的模型。

牙科文档通过 `iframe.contentWindow.dentalModel` 提供 `getState()`、`setReadOnly(boolean)` 和 `snapshot()`；文档上的 `dentalchange` 事件通知标记修改。切换键支持方向键与 Home / End。
