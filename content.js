// 全局变量
let scrollInterval = null;
let scrollSpeed = 3;
let zoomOnPause = true;
let fullscreenMode = false;
let isScrolling = false;
let originalBodyOverflow = '';
let zoomElement = null;
let attemptCount = 0;
const MAX_ATTEMPTS = 5;
let userSelectedContainer = null;
let isSelectingMode = false;
let hoverElement = null;
let selectionBox = null;
let scrollSettings = {
  speed: 1.0
};
let selectedContainer = null;
let currentSpeed = 3;
let isLoopScroll = false;
let floatingButton = null; // 悬浮按钮元素

// 初始化：从存储中加载设置
chrome.storage.sync.get({
  scrollSpeed: 3,
  zoomOnPause: true,
  fullscreenMode: false,
  userSelectedSelector: null,
  scrollSettings: {}
}, function(items) {
  scrollSpeed = items.scrollSpeed;
  zoomOnPause = items.zoomOnPause;
  fullscreenMode = items.fullscreenMode;
  
  // 加载滚动设置
  if (items.scrollSettings) {
    scrollSettings = {...scrollSettings, ...items.scrollSettings};
    currentSpeed = scrollSettings.speed || currentSpeed;
    isLoopScroll = scrollSettings.loopScroll || isLoopScroll;
  }
  
  // 如果有用户之前选择的区域，尝试使用它
  if (items.userSelectedSelector) {
    try {
      userSelectedContainer = document.querySelector(items.userSelectedSelector);
      if (userSelectedContainer) {
        console.log('漫画阅读助手: 使用之前用户选择的区域', items.userSelectedSelector);
      }
    } catch (e) {
      console.log('漫画阅读助手: 无法使用上次保存的选择器', e);
    }
  }
  
  // 如果初始化时全屏模式已开启，则应用
  if (fullscreenMode) {
    toggleFullscreenMode(true);
  }
  
  console.log('漫画阅读助手: 内容脚本已加载，设置已应用');
  
  // 立即创建悬浮按钮
  createFloatingButton();
  
  // 检查是否需要自动开始滚动
  if (scrollSettings.autoScroll) {
    console.log('漫画阅读助手: 自动开始滚动');
    // 延迟一小段时间再开始滚动，确保页面已完全加载
    setTimeout(function() {
      startScrolling(scrollSettings);
    }, 1000);
  }
});

// 确保在页面完全加载后悬浮按钮存在
window.onload = function() {
  console.log('漫画阅读助手: 页面完全加载');
  // 再次检查悬浮按钮是否存在
  if (!document.getElementById('manga-auto-scroll-floating-btn')) {
    console.log('漫画阅读助手: 页面加载完成后创建悬浮按钮');
    createFloatingButton();
  }
};

// 初始化消息监听
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  console.log('收到消息:', request);
  
  switch (request.action) {
    case 'startScrolling':
      startScrolling(request.settings);
      sendResponse({ success: true });
      break;
      
    case 'stopScrolling':
      stopScrolling();
      sendResponse({ success: true });
      break;
      
    case 'getScrollStatus':
      sendResponse({isScrolling: isScrolling});
      break;
      
    // 在消息监听器中修改 updateSettings 的处理部分
    case 'updateSettings':
      if (request.settings) {
        // 保存新的设置
        scrollSettings = {...scrollSettings, ...request.settings};
        
        // 如果正在滚动，直接更新速度和循环设置，无需重启滚动
        if (isScrolling) {
          currentSpeed = scrollSettings.speed;
          isLoopScroll = scrollSettings.loopScroll;
        }
        
        // 保存设置到存储，确保自动滚动设置被保存
        chrome.storage.sync.set({
          scrollSettings: scrollSettings
        });
      }
      sendResponse({ success: true });
      break;
      
    case 'isPageLoaded':
      let containerInfo = '';
      if (selectedContainer) {
        containerInfo = `${selectedContainer.tagName}`;
        if (selectedContainer.id) containerInfo += ` #${selectedContainer.id}`;
        if (selectedContainer.className) containerInfo += ` .${selectedContainer.className.split(' ')[0]}`;
      }
      
      sendResponse({ 
        success: true,
        containerSelected: !!selectedContainer,
        containerInfo: containerInfo
      });
      break;
      
    case 'selectContainer':
      startContainerSelection();
      sendResponse({ success: true });
      break;
      
    case 'clearContainer':
      selectedContainer = null;
      sendResponse({ success: true });
      break;
      
    case 'setContainerId':
      // 根据ID查找容器元素
      const containerId = request.containerId;
      const containerElement = document.getElementById(containerId);
      
      if (containerElement) {
        selectedContainer = containerElement;
        sendResponse({ 
          success: true,
          containerInfo: `${selectedContainer.tagName} #${containerId}`
        });
        
        // 如果正在滚动，重新应用到新容器
        if (isScrolling) {
          stopScrolling();
          startScrolling(scrollSettings);
        }
      } else {
        sendResponse({ success: false });
      }
      break;
      
    default:
      sendResponse({ error: '未知操作' });
  }
  
  return true; // 保持消息通道开放，支持异步响应
});

// 通知所有标签页滚动状态变化
function notifyScrollStatusChange(isScrollingNow) {
  chrome.runtime.sendMessage({
    action: 'scrollStatusChanged',
    isScrolling: isScrollingNow
  });
}

// 开始滚动
function startScrolling(settings) {
  // 如果已经在滚动，只更新设置而不重启滚动
  if (isScrolling) {
    // 更新设置
    currentSpeed = settings.speed;
    isLoopScroll = settings.loopScroll;
    return;
  }
  
  isScrolling = true;
  currentSpeed = settings.speed;
  isLoopScroll = settings.loopScroll;
  
  // 保存自动滚动设置（如果存在）
  if (settings.autoScroll !== undefined) {
    scrollSettings.autoScroll = settings.autoScroll;
  }
  
  // 获取滚动容器
  const container = getScrollContainer();
  
  // 更新悬浮按钮状态
  updateFloatingButtonState();
  
  // 开始滚动
  function scroll() {
    if (!isScrolling) return;
    
    // 使用原始速度值，不再乘以2，保持与UI一致
    const scrollAmount = currentSpeed;
    container.scrollTop += scrollAmount;
    
    // 改进循环滚动检测逻辑，添加小余量确保检测更准确
    if (isLoopScroll && (container.scrollTop + container.clientHeight >= container.scrollHeight - 2)) {
      // 回到顶部
      container.scrollTop = 0;
    }
    
    // 继续滚动
    requestAnimationFrame(scroll);
  }
  
  // 清除之前的滚动间隔
  if (scrollInterval) {
    clearInterval(scrollInterval);
    scrollInterval = null;
  }
  
  // 开始新的滚动
  scroll();
  
  // 通知popup滚动状态已改变
  chrome.runtime.sendMessage({
    action: 'scrollStatusChanged',
    isScrolling: true
  });
}

// 停止滚动
function stopScrolling() {
  isScrolling = false;
  if (scrollInterval) {
    clearInterval(scrollInterval);
    scrollInterval = null;
  }
  
  // 更新悬浮按钮状态
  updateFloatingButtonState();
  
  // 通知popup滚动状态已改变
  chrome.runtime.sendMessage({
    action: 'scrollStatusChanged',
    isScrolling: false
  });
}

// 选择容器模式
function startContainerSelection() {
  // 停止现有的滚动
  stopScrolling();
  
  // 创建样式
  const style = document.createElement('style');
  style.id = 'manga-auto-scroll-selector-style';
  style.textContent = `
    .manga-auto-scroll-highlight {
      outline: 3px solid #f00 !important;
      background-color: rgba(255, 0, 0, 0.1) !important;
      cursor: pointer !important;
    }
  `;
  document.head.appendChild(style);
  
  // 添加提示信息
  const hint = document.createElement('div');
  hint.id = 'manga-auto-scroll-hint';
  hint.style.cssText = `
    position: fixed;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    background-color: #333;
    color: #fff;
    padding: 10px 20px;
    border-radius: 5px;
    z-index: 10000;
    box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    font-family: Arial, sans-serif;
  `;
  hint.textContent = '请点击要自动滚动的漫画容器';
  document.body.appendChild(hint);
  
  // 当前悬停元素
  let currentHover = null;
  
  // 鼠标移动时高亮元素
  function onMouseMove(e) {
    // 移除之前的高亮
    if (currentHover) {
      currentHover.classList.remove('manga-auto-scroll-highlight');
    }
    
    // 获取当前悬停的元素
    currentHover = e.target;
    
    // 添加高亮
    currentHover.classList.add('manga-auto-scroll-highlight');
    
    // 阻止事件冒泡
    e.stopPropagation();
  }
  
  // 点击选择容器
  function onClick(e) {
    // 选择当前元素作为滚动容器
    selectedContainer = e.target;
    
    // 清理
    cleanup();
    
    // 通知选择完成
    chrome.runtime.sendMessage({
      action: 'containerSelected',
      containerInfo: `${selectedContainer.tagName}${selectedContainer.id ? ' #' + selectedContainer.id : ''}${selectedContainer.className ? ' .' + selectedContainer.className.split(' ')[0] : ''}`
    });
    
    // 阻止默认行为和冒泡
    e.preventDefault();
    e.stopPropagation();
  }
  
  // 清理选择模式
  function cleanup() {
    // 移除事件监听
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('click', onClick, true);
    
    // 移除样式和提示
    const styleElem = document.getElementById('manga-auto-scroll-selector-style');
    if (styleElem) styleElem.remove();
    
    const hintElem = document.getElementById('manga-auto-scroll-hint');
    if (hintElem) hintElem.remove();
    
    // 移除当前高亮
    if (currentHover) {
      currentHover.classList.remove('manga-auto-scroll-highlight');
    }
  }
  
  // 添加事件监听
  document.addEventListener('mousemove', onMouseMove, true);
  document.addEventListener('click', onClick, true);
  
  // 按ESC键取消选择
  document.addEventListener('keydown', function onKeyDown(e) {
    if (e.key === 'Escape') {
      cleanup();
      document.removeEventListener('keydown', onKeyDown);
    }
  });
}

// 放大当前视图
function zoomCurrentView() {
  // 移除之前的放大元素
  removeZoom();
  
  // 获取当前视口中心点
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;
  const scrollPosition = window.scrollY;
  
  // 确定视口中心位置
  const viewportCenterY = scrollPosition + (viewportHeight / 2);
  
  // 创建一个新的放大元素
  zoomElement = document.createElement('div');
  zoomElement.className = 'manga-reader-zoom-container';
  
  // 从当前视口截取内容
  const originalContent = document.createElement('div');
  originalContent.className = 'manga-reader-zoom-content';
  
  // 找到视口中心的元素（通常是图像）
  const centerX = viewportWidth / 2;
  const centerY = viewportHeight / 2;
  
  // 通用处理方法（非哔哩哔哩或哔哩哔哩特殊处理失败时）
  const elements = document.elementsFromPoint(centerX, centerY);
  let targetElement = null;
  
  // 寻找图像或可能的漫画面板
  for (const el of elements) {
    if (el.tagName === 'IMG' || 
        (window.getComputedStyle(el).backgroundImage !== 'none' && 
         el.clientHeight > 100 && 
         el.clientWidth > 100)) {
      targetElement = el;
      break;
    }
  }
  
  // 如果找到目标元素
  if (targetElement) {
    const clone = targetElement.cloneNode(true);
    clone.style.width = '100%';
    clone.style.height = 'auto';
    clone.style.maxHeight = '90vh';
    clone.style.objectFit = 'contain';
    originalContent.appendChild(clone);
    
    // 添加放大图标
    const zoomIcon = document.createElement('div');
    zoomIcon.className = 'manga-reader-zoom-icon';
    
    zoomElement.appendChild(originalContent);
    zoomElement.appendChild(zoomIcon);
    document.body.appendChild(zoomElement);
    
    // 为缩放元素添加点击事件，点击后移除
    zoomElement.addEventListener('click', removeZoom);
    
    console.log('漫画阅读助手: 放大视图已显示');
  } else {
    console.log('漫画阅读助手: 未找到合适的放大元素');
  }
}

// 移除放大元素
function removeZoom() {
  if (zoomElement && zoomElement.parentNode) {
    zoomElement.parentNode.removeChild(zoomElement);
    zoomElement = null;
  }
}

// 切换全屏沉浸式模式
function toggleFullscreenMode(enable) {
  if (enable) {
    originalBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    
    // 创建全屏覆盖层
    const overlay = document.createElement('div');
    overlay.id = 'manga-reader-fullscreen-overlay';
    document.body.appendChild(overlay);
    
    // 设置背景
    overlay.style.backgroundImage = 'url(chrome-extension://' + chrome.runtime.id + '/images/background.svg)';
    overlay.style.backgroundSize = 'cover';
    overlay.style.backgroundPosition = 'center';
    overlay.style.opacity = '0.1';
    
    // 创建控制条
    createControls();
    
    // 如果正在滚动，先隐藏控制条
    if (isScrolling) {
      showControls(false);
    }
    
    // 添加鼠标移动监听器，以在用户移动鼠标时显示控制条
    document.addEventListener('mousemove', handleMouseMove);
  } else {
    // 恢复原始滚动
    document.body.style.overflow = originalBodyOverflow;
    
    // 移除全屏覆盖层
    const overlay = document.getElementById('manga-reader-fullscreen-overlay');
    if (overlay) {
      document.body.removeChild(overlay);
    }
    
    // 移除控制条
    const controls = document.getElementById('manga-reader-controls');
    if (controls) {
      document.body.removeChild(controls);
    }
    
    // 移除鼠标移动监听器
    document.removeEventListener('mousemove', handleMouseMove);
  }
}

// 创建控制条
function createControls() {
  let controls = document.getElementById('manga-reader-controls');
  
  if (!controls) {
    controls = document.createElement('div');
    controls.id = 'manga-reader-controls';
    
    // 添加控制按钮
    const playBtn = document.createElement('button');
    playBtn.id = 'manga-reader-play-btn';
    playBtn.className = isScrolling ? 'manga-reader-pause-btn' : 'manga-reader-play-btn';
    playBtn.innerHTML = createButtonSVG(isScrolling ? 'stop' : 'play');
    playBtn.addEventListener('click', function() {
      if (isScrolling) {
        stopScrolling();
        this.className = 'manga-reader-play-btn';
        this.innerHTML = createButtonSVG('play');
      } else {
        startScrolling(scrollSettings);
        this.className = 'manga-reader-pause-btn';
        this.innerHTML = createButtonSVG('stop');
      }
    });
    
    const exitBtn = document.createElement('button');
    exitBtn.id = 'manga-reader-exit-btn';
    exitBtn.className = 'manga-reader-exit-btn';
    exitBtn.innerHTML = createButtonSVG('fullscreen');
    exitBtn.addEventListener('click', function() {
      toggleFullscreenMode(false);
      fullscreenMode = false;
      // 更新存储
      chrome.storage.sync.set({ fullscreenMode: false });
    });
    
    controls.appendChild(playBtn);
    controls.appendChild(exitBtn);
    document.body.appendChild(controls);
  }
  
  return controls;
}

// 创建按钮SVG
function createButtonSVG(type) {
  switch (type) {
    case 'play':
      return '<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="11" fill="#4285f4"/><path d="M9 7 L9 17 L17 12 Z" fill="white"/></svg>';
    case 'stop':
      return '<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="11" fill="#ea4335"/><rect x="7" y="7" width="10" height="10" rx="1" fill="white"/></svg>';
    case 'fullscreen':
      return '<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="11" fill="#34a853"/><path d="M7 7 L17 7 L17 17 L7 17 Z" stroke="white" stroke-width="2" fill="none"/><path d="M7 7 L17 17" stroke="white" stroke-width="1.5" fill="none" opacity="0.5"/><path d="M17 7 L7 17" stroke="white" stroke-width="1.5" fill="none" opacity="0.5"/></svg>';
  }
}

// 显示或隐藏控制条
function showControls(show) {
  const controls = document.getElementById('manga-reader-controls');
  if (controls) {
    controls.style.opacity = show ? '1' : '0';
    controls.style.pointerEvents = show ? 'auto' : 'none';
  }
}

// 鼠标移动的定时器
let mouseMoveTimer = null;

// 处理鼠标移动事件
function handleMouseMove() {
  if (fullscreenMode) {
    showControls(true);
    
    // 清除之前的定时器
    if (mouseMoveTimer) {
      clearTimeout(mouseMoveTimer);
    }
    
    // 如果正在滚动，设置定时器以隐藏控制条
    if (isScrolling) {
      mouseMoveTimer = setTimeout(function() {
        showControls(false);
      }, 2000); // 2秒后隐藏
    }
  }
}

// 获取滚动容器
function getScrollContainer() {
  return selectedContainer || document.documentElement;
}

// 创建悬浮按钮
function createFloatingButton() {
  // 如果已经存在按钮，则不重复创建
  if (document.getElementById('manga-auto-scroll-floating-btn')) {
    console.log('漫画阅读助手: 悬浮按钮已存在，不重复创建');
    return;
  }
  
  // 创建按钮元素
  floatingButton = document.createElement('div');
  floatingButton.id = 'manga-auto-scroll-floating-btn';
  floatingButton.className = isScrolling ? 'manga-auto-scroll-floating-btn-active' : 'manga-auto-scroll-floating-btn';
  
  // 设置按钮样式
  floatingButton.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 50px;
    height: 50px;
    border-radius: 50%;
    background-color: rgba(66, 133, 244, 0.8);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 2147483647;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
    transition: all 0.3s ease;
    user-select: none;
    visibility: visible;
    opacity: 1;
  `;
  
  console.log('漫画阅读助手: 悬浮按钮已创建');
  
  // 设置按钮内容
  updateFloatingButtonState();
  
  // 添加点击事件
  floatingButton.addEventListener('click', function() {
    if (isScrolling) {
      stopScrolling();
    } else {
      startScrolling(scrollSettings);
    }
  });
  
  // 添加鼠标悬停效果
  floatingButton.addEventListener('mouseover', function() {
    this.style.transform = 'scale(1.1)';
    this.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.4)';
  });
  
  floatingButton.addEventListener('mouseout', function() {
    this.style.transform = 'scale(1)';
    this.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.3)';
  });
  
  // 添加到页面
  document.body.appendChild(floatingButton);
  
  // 添加拖动功能
  makeDraggable(floatingButton);
  
  // 确保按钮在DOM中
  setTimeout(() => {
    if (!document.getElementById('manga-auto-scroll-floating-btn')) {
      console.log('漫画阅读助手: 悬浮按钮未能正确添加到DOM，重试');
      document.body.appendChild(floatingButton);
    }
  }, 500);
}

// 设置DOM观察器，确保按钮始终存在
function setupButtonObserver() {
  // 创建一个观察器实例
  const observer = new MutationObserver(function(mutations) {
    // 检查悬浮按钮是否存在
    if (!document.getElementById('manga-auto-scroll-floating-btn')) {
      console.log('漫画阅读助手: 检测到DOM变化，悬浮按钮不存在，重新创建');
      createFloatingButton();
    }
  });
  
  // 配置观察选项
  const config = { childList: true, subtree: true };
  
  // 开始观察
  observer.observe(document.body, config);
  
  console.log('漫画阅读助手: DOM观察器已设置');
}

// 在页面加载后设置观察器
setTimeout(setupButtonObserver, 2000);

// 更新悬浮按钮状态
function updateFloatingButtonState() {
  if (!floatingButton) {
    console.log('漫画阅读助手: 悬浮按钮不存在，无法更新状态');
    return;
  }
  
  console.log('漫画阅读助手: 更新悬浮按钮状态，当前滚动状态:', isScrolling);
  
  if (isScrolling) {
    floatingButton.className = 'manga-auto-scroll-floating-btn-active';
    floatingButton.style.backgroundColor = 'rgba(234, 67, 53, 0.8)';
    floatingButton.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="7" y="7" width="10" height="10" rx="1" fill="white"/></svg>';
  } else {
    floatingButton.className = 'manga-auto-scroll-floating-btn';
    floatingButton.style.backgroundColor = 'rgba(66, 133, 244, 0.8)';
    floatingButton.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M9 7 L9 17 L17 12 Z" fill="white"/></svg>';
  }
  
  // 确保按钮可见
  floatingButton.style.display = 'flex';
}

// 使元素可拖动
function makeDraggable(element) {
  // 存储初始点击位置与元素位置的偏移量
  let offsetX = 0;
  let offsetY = 0;
  
  // 监听鼠标按下事件
  element.addEventListener('mousedown', function(e) {
    e.preventDefault();
    
    // 计算鼠标点击位置与元素左上角的偏移量
    const rect = element.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    
    // 确保元素使用固定定位
    element.style.position = 'fixed';
    
    // 添加鼠标移动和松开事件监听器
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
  
  // 鼠标移动处理函数
  function onMouseMove(e) {
    e.preventDefault();
    
    // 直接计算新位置：鼠标当前位置减去初始偏移量
    const newLeft = e.clientX - offsetX;
    const newTop = e.clientY - offsetY;
    
    // 应用新位置，确保按钮精确跟随鼠标
    element.style.left = newLeft + 'px';
    element.style.top = newTop + 'px';
    element.style.right = 'auto';
    element.style.bottom = 'auto';
  }
  
  // 鼠标松开处理函数
  function onMouseUp() {
    // 移除事件监听器
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    
    // 防止按钮移出视口
    const rect = element.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // 如果按钮部分移出视口，将其拉回
    if (rect.right > viewportWidth) {
      element.style.left = (viewportWidth - rect.width) + 'px';
    }
    if (rect.left < 0) {
      element.style.left = '0px';
    }
    if (rect.bottom > viewportHeight) {
      element.style.top = (viewportHeight - rect.height) + 'px';
    }
    if (rect.top < 0) {
      element.style.top = '0px';
    }
  }
}

// 在页面加载完成后自动开始滚动
document.addEventListener('DOMContentLoaded', function() {
  console.log('漫画阅读助手: DOM内容已加载');
  
  // 确保悬浮按钮已创建
  if (!document.getElementById('manga-auto-scroll-floating-btn')) {
    console.log('漫画阅读助手: 创建悬浮按钮');
    createFloatingButton();
  }
  
  // 延迟一小段时间确保页面完全渲染
  setTimeout(() => {
    // 获取保存的设置
    chrome.storage.sync.get(['speed', 'loopScroll'], function(settings) {
      // 使用默认值或保存的设置
      const scrollSettings = {
        speed: settings.speed || 1,
        loopScroll: settings.loopScroll || false
      };
      
      // 自动开始滚动
      startScrolling(scrollSettings);
      
      // 通知popup更新UI状态
      chrome.runtime.sendMessage({
        action: 'scrollStatusChanged',
        isScrolling: true
      });
    });
  }, 1000); // 延迟1秒，确保页面已完全加载
});
