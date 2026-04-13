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

import React from 'react';
import CardPro from '../../common/ui/CardPro';
import RedemptionsTable from './RedemptionsTable';
import RedemptionsFilters from './RedemptionsFilters';
import RedemptionsDescription from './RedemptionsDescription';
import EditRedemptionModal from './modals/EditRedemptionModal';
import { useRedemptionsData } from '../../../hooks/redemptions/useRedemptionsData';
import { useIsMobile } from '../../../hooks/common/useIsMobile';
import { createCardProPagination } from '../../../helpers/utils';

const RedemptionsPage = () => {
  const redemptionsData = useRedemptionsData();
  const isMobile = useIsMobile();

  const {
    showEdit,
    editingRedemption,
    closeEdit,
    refresh,
    selectedKeys,
    setEditingRedemption,
    setShowEdit,
    batchCopyRedemptions,
    batchDeleteRedemptions,
    formInitValues,
    setFormApi,
    searchRedemptions,
    loading,
    searching,
    compactMode,
    setCompactMode,
    t,
  } = redemptionsData;

  return (
    <>
      <EditRedemptionModal
        refresh={refresh}
        editingRedemption={editingRedemption}
        visiable={showEdit}
        handleClose={closeEdit}
      />

      <CardPro
        type='type1'
        descriptionArea={<RedemptionsDescription t={t} />}
        actionsArea={
          <RedemptionsFilters
            formInitValues={formInitValues}
            setFormApi={setFormApi}
            searchRedemptions={searchRedemptions}
            loading={loading}
            searching={searching}
            selectedKeys={selectedKeys}
            setEditingRedemption={setEditingRedemption}
            setShowEdit={setShowEdit}
            batchCopyRedemptions={batchCopyRedemptions}
            batchDeleteRedemptions={batchDeleteRedemptions}
            compactMode={compactMode}
            setCompactMode={setCompactMode}
            t={t}
          />
        }
        paginationArea={createCardProPagination({
          currentPage: redemptionsData.activePage,
          pageSize: redemptionsData.pageSize,
          total: redemptionsData.tokenCount,
          onPageChange: redemptionsData.handlePageChange,
          onPageSizeChange: redemptionsData.handlePageSizeChange,
          isMobile: isMobile,
          t: redemptionsData.t,
        })}
        t={redemptionsData.t}
      >
        <RedemptionsTable {...redemptionsData} />
      </CardPro>
    </>
  );
};

export default RedemptionsPage;
