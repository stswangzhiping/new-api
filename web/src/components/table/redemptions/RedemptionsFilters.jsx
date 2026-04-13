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

import React, { useRef } from 'react';
import { Form, Button, Select } from '@douyinfe/semi-ui';
import { IconSearch } from '@douyinfe/semi-icons';
import CompactModeToggle from '../../common/ui/CompactModeToggle';
import {
  REDEMPTION_STATUS,
  REDEMPTION_STATUS_MAP,
  CC_SOURCE,
  CC_SOURCE_MAP,
} from '../../../constants/redemption.constants';

const RedemptionsFilters = ({
  // Filter form props
  formInitValues,
  setFormApi,
  searchRedemptions,
  loading,
  searching,
  // Action button props
  selectedKeys,
  setEditingRedemption,
  setShowEdit,
  batchCopyRedemptions,
  batchDeleteRedemptions,
  // UI props
  compactMode,
  setCompactMode,
  t,
}) => {
  const formApiRef = useRef(null);

  const handleReset = () => {
    if (!formApiRef.current) return;
    formApiRef.current.reset();
    setTimeout(() => searchRedemptions(), 100);
  };

  const handleAddRedemption = () => {
    setEditingRedemption({ id: undefined });
    setShowEdit(true);
  };

  const statusOptions = [
    { value: '', label: t('全部状态') },
    { value: REDEMPTION_STATUS.UNUSED,    label: t(REDEMPTION_STATUS_MAP[REDEMPTION_STATUS.UNUSED].text) },
    { value: REDEMPTION_STATUS.USED,      label: t(REDEMPTION_STATUS_MAP[REDEMPTION_STATUS.USED].text) },
    { value: REDEMPTION_STATUS.DISABLED,  label: t(REDEMPTION_STATUS_MAP[REDEMPTION_STATUS.DISABLED].text) },
  ];

  const sourceOptions = [
    { value: '', label: t('全部来源') },
    { value: CC_SOURCE.UNKNOWN,    label: t(CC_SOURCE_MAP[CC_SOURCE.UNKNOWN].text) },
    { value: CC_SOURCE.ACTIVITY,   label: t(CC_SOURCE_MAP[CC_SOURCE.ACTIVITY].text) },
    { value: CC_SOURCE.PURCHASE,   label: t(CC_SOURCE_MAP[CC_SOURCE.PURCHASE].text) },
    { value: CC_SOURCE.ADJUSTMENT, label: t(CC_SOURCE_MAP[CC_SOURCE.ADJUSTMENT].text) },
  ];

  return (
    <div className='flex flex-wrap items-center gap-2 w-full'>
      {/* Action buttons */}
      <Button type='primary' onClick={handleAddRedemption} size='small'>
        {t('添加兑换码')}
      </Button>
      <Button type='tertiary' onClick={batchCopyRedemptions} size='small'>
        {t('复制所选')}
      </Button>
      <Button type='danger' onClick={batchDeleteRedemptions} size='small'>
        {t('清除失效')}
      </Button>

      {/* Divider */}
      <div className='h-4 w-px bg-gray-200 mx-1 hidden md:block' />

      {/* Filter form */}
      <Form
        initValues={formInitValues}
        getFormApi={(api) => {
          setFormApi(api);
          formApiRef.current = api;
        }}
        onSubmit={searchRedemptions}
        allowEmpty={true}
        autoComplete='off'
        layout='horizontal'
        trigger='change'
        stopValidateWithError={false}
        className='flex flex-wrap items-center gap-2'
      >
        <Form.Select
          field='status'
          placeholder={t('全部状态')}
          style={{ width: 110 }}
          size='small'
          pure
          optionList={statusOptions}
          onChange={() => setTimeout(() => searchRedemptions(), 50)}
        />
        <Form.Select
          field='cc_source'
          placeholder={t('全部来源')}
          style={{ width: 110 }}
          size='small'
          pure
          optionList={sourceOptions}
          onChange={() => setTimeout(() => searchRedemptions(), 50)}
        />
        <div style={{ width: 180 }}>
          <Form.Input
            field='searchKeyword'
            prefix={<IconSearch />}
            placeholder={t('关键字(id或者名称)')}
            showClear
            pure
            size='small'
          />
        </div>
        <Button
          type='tertiary'
          htmlType='submit'
          loading={loading || searching}
          size='small'
        >
          {t('查询')}
        </Button>
        <Button type='tertiary' onClick={handleReset} size='small'>
          {t('重置')}
        </Button>
      </Form>

      {/* Compact mode toggle */}
      <div className='ml-auto'>
        <CompactModeToggle
          compactMode={compactMode}
          setCompactMode={setCompactMode}
          t={t}
        />
      </div>
    </div>
  );
};

export default RedemptionsFilters;
