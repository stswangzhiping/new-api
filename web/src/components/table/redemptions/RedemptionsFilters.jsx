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
import { Form, Button } from '@douyinfe/semi-ui';
import { IconSearch } from '@douyinfe/semi-icons';
import {
  REDEMPTION_STATUS,
  REDEMPTION_STATUS_MAP,
  CC_SOURCE,
  CC_SOURCE_MAP,
} from '../../../constants/redemption.constants';

const RedemptionsFilters = ({
  formInitValues,
  setFormApi,
  searchRedemptions,
  loading,
  searching,
  t,
}) => {
  const formApiRef = useRef(null);

  const handleReset = () => {
    if (!formApiRef.current) return;
    formApiRef.current.reset();
    setTimeout(() => searchRedemptions(), 100);
  };

  const statusOptions = [
    { value: '', label: t('全部状态') },
    { value: REDEMPTION_STATUS.UNUSED,   label: t(REDEMPTION_STATUS_MAP[REDEMPTION_STATUS.UNUSED].text) },
    { value: REDEMPTION_STATUS.USED,     label: t(REDEMPTION_STATUS_MAP[REDEMPTION_STATUS.USED].text) },
    { value: REDEMPTION_STATUS.DISABLED, label: t(REDEMPTION_STATUS_MAP[REDEMPTION_STATUS.DISABLED].text) },
  ];

  const sourceOptions = [
    { value: '', label: t('全部来源') },
    { value: CC_SOURCE.UNKNOWN,    label: t(CC_SOURCE_MAP[CC_SOURCE.UNKNOWN].text) },
    { value: CC_SOURCE.ACTIVITY,   label: t(CC_SOURCE_MAP[CC_SOURCE.ACTIVITY].text) },
    { value: CC_SOURCE.PURCHASE,   label: t(CC_SOURCE_MAP[CC_SOURCE.PURCHASE].text) },
    { value: CC_SOURCE.ADJUSTMENT, label: t(CC_SOURCE_MAP[CC_SOURCE.ADJUSTMENT].text) },
  ];

  return (
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
      className='w-full'
    >
      <div className='flex flex-wrap items-center gap-2 w-full'>
        {/* Left: filter controls */}
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
        <div style={{ width: 200 }}>
          <Form.Input
            field='searchKeyword'
            prefix={<IconSearch />}
            placeholder={t('关键字(id或者名称)')}
            showClear
            pure
            size='small'
          />
        </div>

        {/* Right: submit buttons */}
        <div className='flex gap-2 ml-auto'>
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
        </div>
      </div>
    </Form>
  );
};

export default RedemptionsFilters;
