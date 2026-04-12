import React, { useState, useEffect, useCallback } from 'react';
import {
  Table,
  Tag,
  Button,
  Form,
  DatePicker,
  Empty,
  Typography,
  Tooltip,
} from '@douyinfe/semi-ui';
import {
  IllustrationNoResult,
  IllustrationNoResultDark,
} from '@douyinfe/semi-illustrations';
import { useTranslation } from 'react-i18next';
import CardPro from '../../components/common/ui/CardPro';
import { API, showError } from '../../helpers';
import { isAdmin } from '../../helpers/utils';
import { renderQuota } from '../../helpers/render';
import { createCardProPagination } from '../../helpers/utils';
import { useIsMobile } from '../../hooks/common/useIsMobile';
import { CC_SOURCE_MAP } from '../../constants/redemption.constants';
import { DATE_RANGE_PRESETS } from '../../constants/console.constants';

const { Text } = Typography;
const PAGE_SIZE = 20;

function formatTs(ts) {
  if (!ts || ts <= 0) return '—';
  return new Date(ts * 1000).toLocaleString('zh-CN', { hour12: false });
}

function formatExpiry(ts) {
  if (!ts || ts <= 0) return '永久有效';
  return new Date(ts * 1000).toLocaleDateString('zh-CN');
}

function SourceTag({ src }) {
  const { t } = useTranslation();
  const info = CC_SOURCE_MAP?.[src];
  if (!info) return <Tag size='small'>{t('未知')}</Tag>;
  return (
    <Tag color={info.color} size='small'>
      {t(info.text)}
    </Tag>
  );
}

const TopupHistoryPage = () => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const admin = isAdmin();

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activePage, setActivePage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [dateRange, setDateRange] = useState(null);
  const [usernameFilter, setUsernameFilter] = useState('');

  const buildUrl = useCallback(
    (page, size) => {
      const base = admin ? '/api/redemption/' : '/api/redemption/self';
      const params = new URLSearchParams({ p: page, page_size: size });
      return `${base}?${params}`;
    },
    [admin],
  );

  const load = useCallback(
    async (page = 1, size = pageSize) => {
      setLoading(true);
      try {
        const res = await API.get(buildUrl(page, size));
        const { success, message, data } = res.data;
        if (!success) {
          showError(message);
          return;
        }
        // data may be paginated object or plain array (self endpoint)
        let items = Array.isArray(data) ? data : data?.items ?? [];
        const tot = Array.isArray(data)
          ? items.length
          : data?.total ?? items.length;

        // For admin view, filter only used (redeemed_time > 0)
        // and apply optional username filter client-side
        if (admin) {
          items = items.filter((r) => r.redeemed_time > 0);
          if (usernameFilter.trim()) {
            items = items.filter((r) =>
              String(r.used_user_id).includes(usernameFilter.trim()),
            );
          }
        }

        // Apply date range filter client-side
        if (dateRange && dateRange[0] && dateRange[1]) {
          const start = dateRange[0].getTime() / 1000;
          const end = dateRange[1].getTime() / 1000;
          items = items.filter(
            (r) => r.redeemed_time >= start && r.redeemed_time <= end,
          );
        }

        setRecords(items.map((r, i) => ({ ...r, key: r.id ?? i })));
        setTotal(tot);
        setActivePage(page);
      } catch (e) {
        showError(e.message);
      } finally {
        setLoading(false);
      }
    },
    [admin, buildUrl, dateRange, pageSize, usernameFilter],
  );

  useEffect(() => {
    load(1, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columns = [
    {
      title: t('时间'),
      dataIndex: 'redeemed_time',
      render: (v) => (
        <Text className='font-mono text-xs text-[var(--semi-color-text-2)]'>
          {formatTs(v)}
        </Text>
      ),
      width: 170,
    },
    ...(admin
      ? [
          {
            title: t('用户 ID'),
            dataIndex: 'used_user_id',
            width: 90,
            render: (v) => <Text>{v}</Text>,
          },
        ]
      : []),
    {
      title: t('兑换码'),
      dataIndex: 'key',
      render: (v) => (
        <Text className='font-mono text-xs' copyable>
          {v}
        </Text>
      ),
    },
    {
      title: t('名称'),
      dataIndex: 'name',
      render: (v) => <Text>{v || '—'}</Text>,
    },
    {
      title: t('面值 (积分)'),
      dataIndex: 'quota',
      align: 'right',
      width: 120,
      render: (v) => (
        <Text style={{ fontWeight: 600, color: 'var(--semi-color-success)' }}>
          {renderQuota(v)}
        </Text>
      ),
    },
    {
      title: t('来源'),
      dataIndex: 'cc_source',
      width: 100,
      render: (v) => <SourceTag src={v} />,
    },
    {
      title: t('有效期'),
      dataIndex: 'expired_time',
      width: 110,
      render: (v) => (
        <Tooltip content={v > 0 ? formatTs(v) : ''}>
          <Tag
            size='small'
            color={!v || v === 0 ? 'green' : 'orange'}
          >
            {formatExpiry(v)}
          </Tag>
        </Tooltip>
      ),
    },
  ];

  const filtersArea = (
    <div className='flex flex-wrap gap-2 items-end'>
      <DatePicker
        type='dateTimeRange'
        placeholder={[t('开始时间'), t('结束时间')]}
        showClear
        size='small'
        value={dateRange}
        onChange={(v) => setDateRange(v)}
        presets={DATE_RANGE_PRESETS.map((p) => ({
          text: t(p.text),
          start: p.start(),
          end: p.end(),
        }))}
        style={{ width: isMobile ? '100%' : 340 }}
      />
      {admin && (
        <Form.Input
          noLabel
          size='small'
          placeholder={t('用户 ID')}
          value={usernameFilter}
          onChange={(v) => setUsernameFilter(v)}
          style={{ width: 120 }}
        />
      )}
      <Button
        size='small'
        type='tertiary'
        onClick={() => load(1, pageSize)}
        loading={loading}
      >
        {t('查询')}
      </Button>
      <Button
        size='small'
        type='tertiary'
        onClick={() => {
          setDateRange(null);
          setUsernameFilter('');
          load(1, pageSize);
        }}
      >
        {t('重置')}
      </Button>
    </div>
  );

  return (
    <div className='mt-[60px] px-2'>
      <CardPro
        type='type2'
        searchArea={filtersArea}
        paginationArea={createCardProPagination({
          currentPage: activePage,
          pageSize,
          total,
          onPageChange: (p) => load(p, pageSize),
          onPageSizeChange: (s) => {
            setPageSize(s);
            load(1, s);
          },
          isMobile,
          t,
        })}
        t={t}
      >
        <Table
          columns={columns}
          dataSource={records}
          rowKey='key'
          loading={loading}
          size='small'
          pagination={false}
          scroll={isMobile ? undefined : { x: 'max-content' }}
          className='rounded-xl overflow-hidden'
          empty={
            <Empty
              image={
                <IllustrationNoResult style={{ width: 150, height: 150 }} />
              }
              darkModeImage={
                <IllustrationNoResultDark
                  style={{ width: 150, height: 150 }}
                />
              }
              description={t('暂无充值记录')}
              style={{ padding: 30 }}
            />
          }
        />
      </CardPro>
    </div>
  );
};

export default TopupHistoryPage;
