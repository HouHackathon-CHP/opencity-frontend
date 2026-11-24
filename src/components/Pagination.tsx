// SPDX-License-Identifier: Apache-2.0
import { useMemo } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems?: number;
  itemsPerPage?: number;
  itemLabel?: string;
  onPageChange: (page: number) => void;
  accentColor?: string;
}

export function Pagination({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage = 10,
  itemLabel = 'mục',
  onPageChange,
  accentColor,
}: PaginationProps) {
  const pages = useMemo(() => {
    const list: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) {
        list.push(i);
      }
    } else {
      if (currentPage <= 4) {
        for (let i = 1; i <= 5; i++) {
          list.push(i);
        }
        list.push('...');
        list.push(totalPages);
      } else if (currentPage >= totalPages - 3) {
        list.push(1);
        list.push('...');
        for (let i = totalPages - 4; i <= totalPages; i++) {
          list.push(i);
        }
      } else {
        list.push(1);
        list.push('...');
        list.push(currentPage - 1);
        list.push(currentPage);
        list.push(currentPage + 1);
        list.push('...');
        list.push(totalPages);
      }
    }
    return list;
  }, [currentPage, totalPages]);

  if (totalPages <= 1) return null;

  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = totalItems !== undefined ? Math.min(currentPage * itemsPerPage, totalItems) : currentPage * itemsPerPage;

  return (
    <div className="bus-pagination-wrapper" role="navigation" aria-label="Phân trang">
      {totalItems !== undefined && (
        <div className="pagination-summary">
          Trang <strong>{currentPage}</strong> / <strong>{totalPages}</strong>{' '}
          (Hiển thị {startItem} – {endItem} trong tổng số {totalItems.toLocaleString('vi-VN')} {itemLabel})
        </div>
      )}

      <div className="pagination-controls">
        <button
          type="button"
          className="pagination-btn"
          onClick={() => onPageChange(1)}
          disabled={currentPage <= 1}
          title="Về trang đầu tiên (Trang 1)"
          aria-label="Về trang đầu"
        >
          <ChevronsLeft size={16} />
        </button>

        <button
          type="button"
          className="pagination-btn"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          title="Trang trước"
          aria-label="Trang trước"
        >
          <ChevronLeft size={16} />
        </button>

        {pages.map((p, idx) => {
          if (p === '...') {
            return (
              <span key={`dots-${idx}`} className="pagination-ellipsis" aria-hidden="true">
                …
              </span>
            );
          }

          const pageNum = Number(p);
          const isActive = pageNum === currentPage;

          return (
            <button
              key={`page-${p}`}
              type="button"
              className={`pagination-btn ${isActive ? 'active' : ''}`}
              onClick={() => onPageChange(pageNum)}
              aria-current={isActive ? 'page' : undefined}
              style={
                isActive && accentColor
                  ? {
                      backgroundColor: accentColor,
                      borderColor: accentColor,
                      color: '#ffffff',
                      boxShadow: `0 2px 8px ${accentColor}55`,
                    }
                  : undefined
              }
            >
              {p}
            </button>
          );
        })}

        <button
          type="button"
          className="pagination-btn"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          title="Trang tiếp theo"
          aria-label="Trang tiếp theo"
        >
          <ChevronRight size={16} />
        </button>

        <button
          type="button"
          className="pagination-btn"
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage >= totalPages}
          title={`Đến trang cuối cùng (Trang ${totalPages})`}
          aria-label="Đến trang cuối"
        >
          <ChevronsRight size={16} />
        </button>
      </div>
    </div>
  );
}
