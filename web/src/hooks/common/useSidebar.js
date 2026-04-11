/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import { useState, useEffect, useMemo, useContext, useRef } from 'react';
import { StatusContext } from '../../context/Status';
import { API } from '../../helpers';

// capability 对应的侧边栏限制配置
// true = 显示，false = 隐藏（在 adminConfig 允许的基础上进一步收窄）
const CAPABILITY_SIDEBAR_CONFIGS = {
  operator: {
    chat:     { enabled: true,  playground: true,  chat: false },
    console:  { enabled: true,  detail: true,  token: false, log: true, midjourney: false, task: false },
    personal: { enabled: false, topup: false,  personal: false },
    admin:    { enabled: true,  channel: false, models: false, deployment: false, redemption: true, user: true, subscription: false, setting: false },
  },
  // finance 配置待后续定义
  finance: null,
  // admin capability = 全功能，不限制
  admin: null,
};

// 创建一个全局事件系统来同步所有useSidebar实例
const sidebarEventTarget = new EventTarget();
const SIDEBAR_REFRESH_EVENT = 'sidebar-refresh';

export const DEFAULT_ADMIN_CONFIG = {
  chat: {
    enabled: true,
    playground: true,
    chat: true,
  },
  console: {
    enabled: true,
    detail: true,
    token: true,
    log: true,
    midjourney: true,
    task: true,
  },
  personal: {
    enabled: true,
    topup: true,
    personal: true,
  },
  admin: {
    enabled: true,
    channel: true,
    models: true,
    deployment: true,
    redemption: true,
    user: true,
    subscription: true,
    setting: true,
  },
};

const deepClone = (value) => JSON.parse(JSON.stringify(value));

export const mergeAdminConfig = (savedConfig) => {
  const merged = deepClone(DEFAULT_ADMIN_CONFIG);
  if (!savedConfig || typeof savedConfig !== 'object') return merged;

  for (const [sectionKey, sectionConfig] of Object.entries(savedConfig)) {
    if (!sectionConfig || typeof sectionConfig !== 'object') continue;

    if (!merged[sectionKey]) {
      merged[sectionKey] = { ...sectionConfig };
      continue;
    }

    merged[sectionKey] = { ...merged[sectionKey], ...sectionConfig };
  }

  return merged;
};

export const useSidebar = () => {
  const [statusState] = useContext(StatusContext);
  const [userConfig, setUserConfig] = useState(null);
  const [capabilityConfig, setCapabilityConfig] = useState(null);
  const [userCapability, setUserCapability] = useState(null); // 'operator' | 'finance' | 'admin' | null
  const [loading, setLoading] = useState(true);
  const instanceIdRef = useRef(null);
  const hasLoadedOnceRef = useRef(false);

  if (!instanceIdRef.current) {
    const randomPart = Math.random().toString(16).slice(2);
    instanceIdRef.current = `sidebar-${Date.now()}-${randomPart}`;
  }

  // 获取管理员配置
  const adminConfig = useMemo(() => {
    if (statusState?.status?.SidebarModulesAdmin) {
      try {
        const config = JSON.parse(statusState.status.SidebarModulesAdmin);
        return mergeAdminConfig(config);
      } catch (error) {
        return mergeAdminConfig(null);
      }
    }
    return mergeAdminConfig(null);
  }, [statusState?.status?.SidebarModulesAdmin]);

  // 加载用户配置的通用方法
  const loadUserConfig = async ({ withLoading } = {}) => {
    const shouldShowLoader =
      typeof withLoading === 'boolean'
        ? withLoading
        : !hasLoadedOnceRef.current;

    try {
      if (shouldShowLoader) {
        setLoading(true);
      }

      const res = await API.get('/api/user/self');
      const userData = res.data.success ? res.data.data : null;

      if (userData?.sidebar_modules) {
        let config;
        if (typeof userData.sidebar_modules === 'string') {
          config = JSON.parse(userData.sidebar_modules);
        } else {
          config = userData.sidebar_modules;
        }
        setUserConfig(config);
      } else {
        // 当用户没有配置时，生成一个基于管理员配置的默认用户配置
        const defaultUserConfig = {};
        Object.keys(adminConfig).forEach((sectionKey) => {
          if (adminConfig[sectionKey]?.enabled) {
            defaultUserConfig[sectionKey] = { enabled: true };
            Object.keys(adminConfig[sectionKey]).forEach((moduleKey) => {
              if (
                moduleKey !== 'enabled' &&
                adminConfig[sectionKey][moduleKey]
              ) {
                defaultUserConfig[sectionKey][moduleKey] = true;
              }
            });
          }
        });
        setUserConfig(defaultUserConfig);
      }

      // 管理员用户：根据 capability 加载侧边栏限制
      if (userData?.role === 10) {
        try {
          const capRes = await API.get('/api/capability/self');
          if (capRes.data.success && capRes.data.data?.length > 0) {
            const cap = capRes.data.data[0];
            setUserCapability(cap);
            setCapabilityConfig(CAPABILITY_SIDEBAR_CONFIGS[cap] || null);
          } else {
            setUserCapability(null);
            setCapabilityConfig(null);
          }
        } catch (_) {
          setUserCapability(null);
          setCapabilityConfig(null);
        }
      } else {
        setUserCapability(null);
        setCapabilityConfig(null);
      }
    } catch (error) {
      // 出错时生成默认配置
      const defaultUserConfig = {};
      Object.keys(adminConfig).forEach((sectionKey) => {
        if (adminConfig[sectionKey]?.enabled) {
          defaultUserConfig[sectionKey] = { enabled: true };
          Object.keys(adminConfig[sectionKey]).forEach((moduleKey) => {
            if (moduleKey !== 'enabled' && adminConfig[sectionKey][moduleKey]) {
              defaultUserConfig[sectionKey][moduleKey] = true;
            }
          });
        }
      });
      setUserConfig(defaultUserConfig);
      setCapabilityConfig(null);
    } finally {
      if (shouldShowLoader) {
        setLoading(false);
      }
      hasLoadedOnceRef.current = true;
    }
  };

  // 刷新用户配置的方法（供外部调用）
  const refreshUserConfig = async () => {
    if (Object.keys(adminConfig).length > 0) {
      await loadUserConfig({ withLoading: false });
    }

    // 触发全局刷新事件，通知所有useSidebar实例更新
    sidebarEventTarget.dispatchEvent(
      new CustomEvent(SIDEBAR_REFRESH_EVENT, {
        detail: { sourceId: instanceIdRef.current, skipLoader: true },
      }),
    );
  };

  // 加载用户配置
  useEffect(() => {
    // 只有当管理员配置加载完成后才加载用户配置
    if (Object.keys(adminConfig).length > 0) {
      loadUserConfig();
    }
  }, [adminConfig]);

  // 监听全局刷新事件
  useEffect(() => {
    const handleRefresh = (event) => {
      if (event?.detail?.sourceId === instanceIdRef.current) {
        return;
      }

      if (Object.keys(adminConfig).length > 0) {
        loadUserConfig({
          withLoading: event?.detail?.skipLoader ? false : undefined,
        });
      }
    };

    sidebarEventTarget.addEventListener(SIDEBAR_REFRESH_EVENT, handleRefresh);

    return () => {
      sidebarEventTarget.removeEventListener(
        SIDEBAR_REFRESH_EVENT,
        handleRefresh,
      );
    };
  }, [adminConfig]);

  // 计算最终的显示配置
  // 三层叠加：adminConfig ∩ userConfig ∩ capabilityConfig
  const finalConfig = useMemo(() => {
    const result = {};

    if (!adminConfig || Object.keys(adminConfig).length === 0) {
      return result;
    }

    if (!userConfig) {
      return result;
    }

    Object.keys(adminConfig).forEach((sectionKey) => {
      const adminSection = adminConfig[sectionKey];
      const userSection = userConfig[sectionKey];
      const capSection = capabilityConfig?.[sectionKey];

      if (!adminSection?.enabled) {
        result[sectionKey] = { enabled: false };
        return;
      }

      // capability 可以整体禁用某个区域
      const capSectionEnabled = capSection ? capSection.enabled !== false : true;
      const sectionEnabled =
        capSectionEnabled &&
        (userSection ? userSection.enabled !== false : true);

      result[sectionKey] = { enabled: sectionEnabled };

      Object.keys(adminSection).forEach((moduleKey) => {
        if (moduleKey === 'enabled') return;

        const adminAllowed = adminSection[moduleKey];
        const userAllowed = userSection
          ? userSection[moduleKey] !== false
          : true;
        // capability 未定义该 key 时视为允许（不限制）
        const capAllowed =
          capSection && capSection[moduleKey] !== undefined
            ? capSection[moduleKey] !== false
            : true;

        result[sectionKey][moduleKey] =
          adminAllowed && userAllowed && capAllowed && sectionEnabled;
      });
    });

    return result;
  }, [adminConfig, userConfig, capabilityConfig]);

  // 检查特定功能是否应该显示
  const isModuleVisible = (sectionKey, moduleKey = null) => {
    if (moduleKey) {
      return finalConfig[sectionKey]?.[moduleKey] === true;
    } else {
      return finalConfig[sectionKey]?.enabled === true;
    }
  };

  // 检查区域是否有任何可见的功能
  const hasSectionVisibleModules = (sectionKey) => {
    const section = finalConfig[sectionKey];
    if (!section?.enabled) return false;

    return Object.keys(section).some(
      (key) => key !== 'enabled' && section[key] === true,
    );
  };

  // 获取区域的可见功能列表
  const getVisibleModules = (sectionKey) => {
    const section = finalConfig[sectionKey];
    if (!section?.enabled) return [];

    return Object.keys(section).filter(
      (key) => key !== 'enabled' && section[key] === true,
    );
  };

  return {
    loading,
    adminConfig,
    userConfig,
    finalConfig,
    userCapability,
    isModuleVisible,
    hasSectionVisibleModules,
    getVisibleModules,
    refreshUserConfig,
  };
};
