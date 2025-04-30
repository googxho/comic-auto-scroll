// 安装或更新时
chrome.runtime.onInstalled.addListener(function(details) {
  // 设置默认配置
  chrome.storage.sync.get({
    scrollSpeed: 3,
    zoomOnPause: true,
    fullscreenMode: false
  }, function(items) {
    // 如果没有保存过设置，则设置默认值
    if (chrome.runtime.lastError || !items) {
      chrome.storage.sync.set({
        scrollSpeed: 3,
        zoomOnPause: true,
        fullscreenMode: false
      });
    }
  });

  // 在控制台显示安装信息
  console.log('漫画阅读助手已' + (details.reason === 'install' ? '安装' : '更新') + '，版本: ' + chrome.runtime.getManifest().version);
});

// 监听来自内容脚本的消息
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  // 例如，可以在这里记录错误或使用情况
  if (request.action === 'log') {
    console.log('来自内容脚本的日志:', request.message);
    sendResponse({ received: true });
  }
  
  return true; // 异步响应
});

// 保存上一次的URL，用于检测URL变化
let lastUrls = {};

// 监听标签页的更新
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  // 当页面完成加载时
  if (changeInfo.status === 'complete' && tab.active) {
    // 通知内容脚本页面已经加载完成
    chrome.tabs.sendMessage(tabId, { action: 'pageLoaded' }, function(response) {
      // 忽略错误，因为内容脚本可能还没有加载
      if (chrome.runtime.lastError) {
        console.debug('页面已加载，但内容脚本可能还未准备好');
      }
    });
  }
});

// 清理不再存在的标签页记录
chrome.tabs.onRemoved.addListener(function(tabId) {
  if (lastUrls[tabId]) {
    delete lastUrls[tabId];
  }
}); 
