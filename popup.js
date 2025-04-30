// 全局变量保存当前设置
let currentSettings = {
  speed: 1.0,
  isScrolling: false,
  containerSelected: false,
  loopScroll: false,
  autoScroll: false
};

// DOM元素引用
let speedSlider, speedValue, toggleScrollBtn, containerStatus, selectContainerBtn, clearContainerBtn, containerIdInput, setContainerIdBtn, loopScrollToggle, autoScrollToggle;

// 初始化函数
document.addEventListener('DOMContentLoaded', function() {
  // 获取DOM元素
  speedSlider = document.getElementById('speed-slider');
  speedValue = document.getElementById('speed-value');
  toggleScrollBtn = document.getElementById('toggle-scroll-btn');
  containerStatus = document.getElementById('container-status');
  selectContainerBtn = document.getElementById('select-container-btn');
  clearContainerBtn = document.getElementById('clear-container-btn');
  containerIdInput = document.getElementById('container-id-input');
  setContainerIdBtn = document.getElementById('set-container-id-btn');
  loopScrollToggle = document.getElementById('loop-scroll-toggle');
  autoScrollToggle = document.getElementById('auto-scroll-toggle');
  
  // 初始化UI
  initUI();
  
  // 检查滚动状态
  checkScrollStatus();
  
  // 添加事件监听器
  // 改进速度滑块的事件监听器
  speedSlider.addEventListener('input', function() {
    // 更新显示的速度值
    speedValue.textContent = speedSlider.value;
    
    // 更新设置并发送到content.js
    updateSettings({
      speed: parseFloat(speedSlider.value),
      loopScroll: currentSettings.loopScroll,
      autoScroll: currentSettings.autoScroll
    });
  });
  
  toggleScrollBtn.addEventListener('click', toggleScrolling);
  selectContainerBtn.addEventListener('click', selectContainer);
  clearContainerBtn.addEventListener('click', clearContainer);
  loopScrollToggle.addEventListener('change', function() {
    updateSettings({loopScroll: this.checked});
  });
  
  // 添加自动滚动开关的事件监听器
  autoScrollToggle.addEventListener('change', function() {
    updateSettings({autoScroll: this.checked});
  });
  
  // 添加设置容器ID的事件监听器
  setContainerIdBtn.addEventListener('click', setContainerId);
  
  // 检查当前页面是否已加载
  checkContainerStatus();
});

// 初始化UI
function initUI() {
  // 从存储中加载设置
  chrome.storage.sync.get(['scrollSettings'], function(result) {
    if (result.scrollSettings) {
      currentSettings = {...currentSettings, ...result.scrollSettings};
      speedSlider.value = currentSettings.speed;
      speedValue.textContent = currentSettings.speed;
      loopScrollToggle.checked = currentSettings.loopScroll;
      autoScrollToggle.checked = currentSettings.autoScroll;
      
      // 如果有保存的容器ID，则显示在输入框中
      if (currentSettings.containerId) {
        containerIdInput.value = currentSettings.containerId;
      }
    }
  });
}

// 保存设置到存储
function saveSettings() {
  chrome.storage.sync.set({
    scrollSettings: currentSettings
  });
}

// 更新设置
function updateSettings(settings) {
  // 更新本地设置
  currentSettings = {...currentSettings, ...settings};
  
  // 保存到存储
  saveSettings();
  
  // 如果有活动标签页，更新它的设置
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (tabs.length > 0) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'updateSettings',
        settings: settings
      });
    }
  });
}

// 切换滚动状态
function toggleScrolling() {
  if (currentSettings.isScrolling) {
    stopScrolling();
  } else {
    startScrolling();
  }
}

// 开始滚动
function startScrolling() {
  // 更新UI
  toggleScrollBtn.innerHTML = '<i class="fas fa-stop"></i>停止滚动';
  toggleScrollBtn.classList.add('btn-stop');
  
  // 更新设置
  currentSettings.isScrolling = true;
  saveSettings();
  
  // 向当前标签页发送开始滚动的消息
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (tabs.length > 0) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'startScrolling',
        settings: {
          speed: parseFloat(speedSlider.value),
          loopScroll: currentSettings.loopScroll,
          autoScroll: currentSettings.autoScroll
        }
      });
    }
  });
}

// 停止滚动
function stopScrolling() {
  // 更新UI
  toggleScrollBtn.innerHTML = '<i class="fas fa-play"></i>开始滚动';
  toggleScrollBtn.classList.remove('btn-stop');
  
  // 更新设置
  currentSettings.isScrolling = false;
  saveSettings();
  
  // 向当前标签页发送停止滚动的消息
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (tabs.length > 0) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'stopScrolling'
      });
    }
  });
}

// 检查滚动状态
function checkScrollStatus() {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (tabs.length > 0) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'getScrollStatus'
      }, function(response) {
        if (response && response.isScrolling !== undefined) {
          currentSettings.isScrolling = response.isScrolling;
          updateScrollUI();
        }
      });
    }
  });
}

// 更新滚动UI
function updateScrollUI() {
  if (currentSettings.isScrolling) {
    toggleScrollBtn.innerHTML = '<i class="fas fa-stop"></i>停止滚动';
    toggleScrollBtn.classList.add('btn-stop');
  } else {
    toggleScrollBtn.innerHTML = '<i class="fas fa-play"></i>开始滚动';
    toggleScrollBtn.classList.remove('btn-stop');
  }
}

// 检查容器状态
function checkContainerStatus() {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (tabs.length > 0) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'isPageLoaded'
      }, function(response) {
        if (response && response.success) {
          currentSettings.containerSelected = response.containerSelected;
          
          // 更新容器状态显示
          if (response.containerSelected) {
            containerStatus.textContent = `已选择: ${response.containerInfo}`;
            containerStatus.style.color = '#4CAF50';
            clearContainerBtn.disabled = false;
          } else {
            containerStatus.textContent = '未选择滚动容器（将使用整页滚动）';
            containerStatus.style.color = '#FF9800';
            clearContainerBtn.disabled = true;
          }
        }
      });
    }
  });
}

// 设置容器ID
function setContainerId() {
  const containerId = containerIdInput.value.trim();
  
  if (!containerId) {
    containerStatus.textContent = '请输入有效的容器ID';
    containerStatus.style.color = '#f44336';
    return;
  }
  
  // 向content.js发送设置容器ID的消息
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (tabs.length > 0) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'setContainerId',
        containerId: containerId
      }, function(response) {
        if (response && response.success) {
          // 更新设置
          currentSettings.containerId = containerId;
          currentSettings.containerSelected = true;
          saveSettings();
          
          // 更新UI
          containerStatus.textContent = `已设置ID: ${containerId}`;
          containerStatus.style.color = '#4CAF50';
          clearContainerBtn.disabled = false;
        } else {
          // 找不到容器
          containerStatus.textContent = `找不到ID为 "${containerId}" 的容器`;
          containerStatus.style.color = '#f44336';
        }
      });
    }
  });
}

// 选择容器
function selectContainer() {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (tabs.length > 0) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'selectContainer'
      });
      
      // 关闭弹窗，让用户看到页面
      window.close();
    }
  });
}

// 清除容器
function clearContainer() {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (tabs.length > 0) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'clearContainer'
      }, function() {
        containerStatus.textContent = '未选择滚动容器（将使用整页滚动）';
        containerStatus.style.color = '#FF9800';
        clearContainerBtn.disabled = true;
        currentSettings.containerSelected = false;
        currentSettings.containerId = '';
        containerIdInput.value = '';
        saveSettings();
      });
    }
  });
}

// 监听来自content.js的消息
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'scrollStatusChanged') {
    currentSettings.isScrolling = request.isScrolling;
    updateScrollUI();
  } else if (request.action === 'containerSelected') {
    // 容器已选择，更新UI
    if (containerStatus) {
      containerStatus.textContent = `已选择: ${request.containerInfo}`;
      containerStatus.style.color = '#4CAF50';
      clearContainerBtn.disabled = false;
      currentSettings.containerSelected = true;
    }
  }
});

// 在popup打开时检查当前滚动状态
document.addEventListener('DOMContentLoaded', function() {
  // 查询当前标签页的滚动状态
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    chrome.tabs.sendMessage(tabs[0].id, {action: 'getScrollStatus'}, function(response) {
      if (response && response.isScrolling) {
        // 更新UI以反映正在滚动的状态
        updateUIForScrolling(true);
      }
    });
  });
});
