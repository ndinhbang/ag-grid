import _ from '../utils';
import Column from "../entities/column";
import RenderedHeaderGroupCell from "./renderedHeaderGroupCell";
import FilterManager from "../filter/filterManager";
import {ColumnController} from "../columnController/columnController";
import {Grid} from "../grid";
import HeaderTemplateLoader from "./headerTemplateLoader";
import GridOptionsWrapper from "../gridOptionsWrapper";
import {DragService} from "./dragService";
import HeaderRenderer from "./headerRenderer";
import {MoveColumnController} from "./moveColumnController";
import GridPanel from "../gridPanel/gridPanel";
import {GridCore} from "../gridCore";
import {IMenuFactory} from "../interfaces/iMenuFactory";
import PopupService from "../widgets/agPopupService";
import {Autowired} from "../context/context";
import {Context} from "../context/context";
import {CssClassApplier} from "./cssClassApplier";
import {IRenderedHeaderElement} from "./iRenderedHeaderElement";

export default class RenderedHeaderCell implements IRenderedHeaderElement {

    private static DEFAULT_SORTING_ORDER = [Column.SORT_ASC, Column.SORT_DESC, null];

    @Autowired('context') private context: Context;
    @Autowired('filterManager') private filterManager: FilterManager;
    @Autowired('columnController') private columnController: ColumnController;
    @Autowired('$compile') private $compile: any;
    @Autowired('gridCore') private gridCore: GridCore;
    @Autowired('headerTemplateLoader') private headerTemplateLoader: HeaderTemplateLoader;
    @Autowired('dragService') private dragService: DragService;
    @Autowired('menuFactory') private menuFactory: IMenuFactory;
    @Autowired('gridOptionsWrapper') private gridOptionsWrapper: GridOptionsWrapper;

    private eHeaderCell: HTMLElement;
    private eSortAsc: HTMLElement;
    private eSortDesc: HTMLElement;
    private eSortNone: HTMLElement;
    private eFilterIcon: HTMLElement;
    private eText: HTMLElement;
    private eHeaderCellLabel: HTMLElement;
    private eRoot: HTMLElement;

    private column: Column;
    private childScope: any;

    private startWidth: number;
    private parentScope: any;

    // for better structured code, anything we need to do when this column gets destroyed,
    // we put a function in here. otherwise we would have a big destroy function with lots
    // of 'if / else' mapping to things that got created.
    private destroyFunctions: (()=>void)[] = [];

    constructor(column: Column, parentScope: any, eRoot: HTMLElement) {
        this.column = column;
        this.parentScope = parentScope;
        this.eRoot = eRoot;
    }

    public getGui(): HTMLElement {
        return this.eHeaderCell;
    }

    public destroy(): void {
        this.destroyFunctions.forEach( (func)=> {
            func();
        });
    }

    private createScope(parentScope: any): void {
        if (this.gridOptionsWrapper.isAngularCompileHeaders()) {
            this.childScope = parentScope.$new();
            this.childScope.colDef = this.column.getColDef();
            this.childScope.colDefWrapper = this.column;

            this.destroyFunctions.push( ()=> {
                this.childScope.$destroy();
            });
        }
    }

    private addAttributes(): void {
        this.eHeaderCell.setAttribute("colId", this.column.getColId());
    }

    private addMenu(): void {
        var eMenu = <HTMLElement> this.eHeaderCell.querySelector('#agMenu');

        // if no menu provided in template, do nothing
        if (!eMenu) {
            return;
        }

        var weWantMenu = this.gridOptionsWrapper.isEnableFilter() && !this.column.getColDef().suppressMenu;
        if (!weWantMenu) {
            _.removeFromParent(eMenu);
            return;
        }

        var that = this;
        eMenu.addEventListener('click', function () {
            that.showMenu(this);
        });

        if (!this.gridOptionsWrapper.isSuppressMenuHide()) {
            eMenu.style.opacity = '0';
            this.eHeaderCell.addEventListener('mouseenter', function () {
                eMenu.style.opacity = '1';
            });
            this.eHeaderCell.addEventListener('mouseleave', function () {
                eMenu.style.opacity = '0';
            });
        }
        var style = <any> eMenu.style;
        style['transition'] = 'opacity 0.2s, border 0.2s';
        style['-webkit-transition'] = 'opacity 0.2s, border 0.2s';
    }

    public showMenu(eventSource: HTMLElement) {
        this.menuFactory.showMenu(this.column, eventSource);
    }

    private removeSortIcons(): void {
        _.removeFromParent(this.eHeaderCell.querySelector('#agSortAsc'));
        _.removeFromParent(this.eHeaderCell.querySelector('#agSortDesc'));
        _.removeFromParent(this.eHeaderCell.querySelector('#agNoSort'));
    }

    private addSortIcons(): void {
        this.eSortAsc = <HTMLElement> this.eHeaderCell.querySelector('#agSortAsc');
        this.eSortDesc = <HTMLElement> this.eHeaderCell.querySelector('#agSortDesc');
        this.eSortNone = <HTMLElement> this.eHeaderCell.querySelector('#agNoSort');

        if (this.eSortAsc) {
            this.eSortAsc.style.display = 'none';
        }
        if (this.eSortDesc) {
            this.eSortDesc.style.display = 'none';
        }

        var showingNoSortIcon = this.column.getColDef().unSortIcon || this.gridOptionsWrapper.isUnSortIcon();
        // 'no sort' icon
        if (!showingNoSortIcon) {
            _.removeFromParent(this.eSortNone);
        }
    }

    private addMovingCss(): void {
        // this function adds or removes the moving css, based on if the col is moving
        var addMovingCssFunc = ()=> {
            if (this.column.isMoving()) {
                _.addCssClass(this.eHeaderCell, 'ag-header-cell-moving');
            } else {
                _.removeCssClass(this.eHeaderCell, 'ag-header-cell-moving');
            }
        };
        // call it now once, so the col is set up correctly
        addMovingCssFunc();
        // then call it every time we are informed of a moving state change in the col
        this.column.addEventListener(Column.EVENT_MOVING_CHANGED, addMovingCssFunc);
        // finally we remove the listener when this cell is no longer rendered
        this.destroyFunctions.push(()=> {
            this.column.removeEventListener(Column.EVENT_MOVING_CHANGED, addMovingCssFunc);
        });
    }

    public agPostWire(): void {
        this.eHeaderCell = this.headerTemplateLoader.createHeaderElement(this.column);

        _.addCssClass(this.eHeaderCell, 'ag-header-cell');

        this.createScope(this.parentScope);
        this.addAttributes();
        CssClassApplier.addHeaderClassesFromCollDef(this.column.getColDef(), this.eHeaderCell, this.gridOptionsWrapper);

        this.addMovingCss();

        var colDef = this.column.getColDef();

        // add tooltip if exists
        if (colDef.headerTooltip) {
            this.eHeaderCell.title = colDef.headerTooltip;
        }

        // label div
        this.eText = <HTMLElement> this.eHeaderCell.querySelector('#agText');
        this.eHeaderCellLabel = <HTMLElement> this.eHeaderCell.querySelector('#agHeaderCellLabel');

        this.addResize();
        this.addMove();
        this.addMenu();

        // add in sort icons
        this.addSort();

        // add in filter icon
        this.eFilterIcon = <HTMLElement> this.eHeaderCell.querySelector('#agFilter');

        // render the cell, use a renderer if one is provided
        var headerCellRenderer: any;
        if (colDef.headerCellRenderer) { // first look for a renderer in col def
            headerCellRenderer = colDef.headerCellRenderer;
        } else if (this.gridOptionsWrapper.getHeaderCellRenderer()) { // second look for one in grid options
            headerCellRenderer = this.gridOptionsWrapper.getHeaderCellRenderer();
        }

        var headerNameValue = this.columnController.getDisplayNameForCol(this.column);

        if (this.eText) {
            if (headerCellRenderer) {
                this.useRenderer(headerNameValue, headerCellRenderer);
            } else {
                // no renderer, default text render
                this.eText.className = 'ag-header-cell-text';
                this.eText.innerHTML = headerNameValue;
            }
        }

        this.eHeaderCell.style.width = _.formatWidth(this.column.getActualWidth());

        this.refreshFilterIcon();
        this.refreshSortIcon();
    }

    private addSort(): void {
        var enableSorting = this.gridOptionsWrapper.isEnableSorting() && !this.column.getColDef().suppressSorting;
        if (enableSorting) {
            this.addSortIcons();
            this.addSortHandling();
        } else {
            this.removeSortIcons();
        }
    }

    private addMove(): void {
        if (this.gridOptionsWrapper.isSuppressMovableColumns() || this.column.getColDef().suppressMovable) {
            return;
        }
        if (this.gridOptionsWrapper.isForPrint()) {
            // don't allow moving of headers when forPrint, as the header overlay doesn't exist
            return;
        }

        if (this.eHeaderCellLabel) {
            var moveColumnController = new MoveColumnController(this.column, this.eHeaderCellLabel, this.eRoot, this.eHeaderCell);
            this.context.wireBean(moveColumnController);
        }
    }

    private addResize(): void {
        var colDef = this.column.getColDef();
        var eResize = this.eHeaderCell.querySelector('#agResizeBar');

        // if no eResize in template, do nothing
        if (!eResize) {
            return;
        }

        var weWantResize = this.gridOptionsWrapper.isEnableColResize() && !colDef.suppressResize;
        if (!weWantResize) {
            _.removeFromParent(eResize);
            return;
        }

        this.dragService.addDragHandling({
            eDraggableElement: eResize,
            eBody: this.eRoot,
            cursor: 'col-resize',
            startAfterPixels: 0,
            onDragStart: this.onDragStart.bind(this),
            onDragging: this.onDragging.bind(this)
        });

        var weWantAutoSize = !this.gridOptionsWrapper.isSuppressAutoSize() && !colDef.suppressAutoSize;
        if (weWantAutoSize) {
            eResize.addEventListener('dblclick', (event: MouseEvent) => {
                this.columnController.autoSizeColumn(this.column);
            });
        }
    }

    private useRenderer(headerNameValue: string, headerCellRenderer: Function): void {
        // renderer provided, use it
        var cellRendererParams = {
            colDef: this.column.getColDef(),
            $scope: this.childScope,
            context: this.gridOptionsWrapper.getContext(),
            value: headerNameValue,
            api: this.gridOptionsWrapper.getApi(),
            eHeaderCell: this.eHeaderCell
        };
        var cellRendererResult = headerCellRenderer(cellRendererParams);
        var childToAppend: any;
        if (_.isNodeOrElement(cellRendererResult)) {
            // a dom node or element was returned, so add child
            childToAppend = cellRendererResult;
        } else {
            // otherwise assume it was html, so just insert
            var eTextSpan = document.createElement("span");
            eTextSpan.innerHTML = cellRendererResult;
            childToAppend = eTextSpan;
        }
        // angular compile header if option is turned on
        if (this.gridOptionsWrapper.isAngularCompileHeaders()) {
            var childToAppendCompiled = this.$compile(childToAppend)(this.childScope)[0];
            this.eText.appendChild(childToAppendCompiled);
        } else {
            this.eText.appendChild(childToAppend);
        }
    }

    public refreshFilterIcon(): void {
        var filterPresent = this.filterManager.isFilterPresentForCol(this.column.getColId());

        if (this.eFilterIcon) {
            _.addOrRemoveCssClass(this.eHeaderCell, 'ag-header-cell-filtered', filterPresent);
            this.eFilterIcon.style.display = filterPresent ? 'inline' : 'none';
        }
    }

    public refreshSortIcon(): void {
        // update visibility of icons
        var sortAscending = this.column.getSort() === Column.SORT_ASC;
        var sortDescending = this.column.getSort() === Column.SORT_DESC;
        var sortNone = this.column.getSort() !== Column.SORT_DESC && this.column.getSort() !== Column.SORT_ASC;

        if (this.eSortAsc) {
            _.setVisible(this.eSortAsc, sortAscending);
        }
        if (this.eSortDesc) {
            _.setVisible(this.eSortDesc, sortDescending);
        }
        if (this.eSortNone) {
            _.setVisible(this.eSortNone, sortNone);
        }

        _.addOrRemoveCssClass(this.eHeaderCell, 'ag-header-cell-sorted-asc', sortAscending);
        _.addOrRemoveCssClass(this.eHeaderCell, 'ag-header-cell-sorted-desc', sortDescending);
        _.addOrRemoveCssClass(this.eHeaderCell, 'ag-header-cell-sorted-none', sortNone);
    }

    private getNextSortDirection(): string {

        var sortingOrder: string[];
        if (this.column.getColDef().sortingOrder) {
            sortingOrder = this.column.getColDef().sortingOrder;
        } else if (this.gridOptionsWrapper.getSortingOrder()) {
            sortingOrder = this.gridOptionsWrapper.getSortingOrder();
        } else {
            sortingOrder = RenderedHeaderCell.DEFAULT_SORTING_ORDER;
        }

        if ( !Array.isArray(sortingOrder) || sortingOrder.length <= 0) {
            console.warn('ag-grid: sortingOrder must be an array with at least one element, currently it\'s ' + sortingOrder);
            return;
        }

        var currentIndex = sortingOrder.indexOf(this.column.getSort());
        var notInArray = currentIndex < 0;
        var lastItemInArray = currentIndex == sortingOrder.length - 1;
        var result: string;
        if (notInArray || lastItemInArray) {
            result = sortingOrder[0];
        } else {
            result = sortingOrder[currentIndex + 1];
        }

        // verify the sort type exists, as the user could provide the sortOrder, need to make sure it's valid
        if (RenderedHeaderCell.DEFAULT_SORTING_ORDER.indexOf(result) < 0) {
            console.warn('ag-grid: invalid sort type ' + result);
            return null;
        }

        return result;
    }

    private addSortHandling() {
        if (!this.eHeaderCellLabel) {
            return;
        }
        this.eHeaderCellLabel.addEventListener("click", (event: any) => {

            // update sort on current col
            this.column.setSort(this.getNextSortDirection());

            // sortedAt used for knowing order of cols when multi-col sort
            if (this.column.getSort()) {
                this.column.setSortedAt(new Date().valueOf());
            } else {
                this.column.setSortedAt(null);
            }

            var doingMultiSort = !this.gridOptionsWrapper.isSuppressMultiSort() && event.shiftKey;

            // clear sort on all columns except this one, and update the icons
            if (!doingMultiSort) {
                this.columnController.clearSortBarThisColumn(this.column);
            }

            this.gridCore.onSortingChanged();
        });
    }

    public onDragStart(): void {
        this.startWidth = this.column.getActualWidth();
    }

    public onDragging(dragChange: number, finished: boolean): void {
        var newWidth = this.startWidth + dragChange;
        this.columnController.setColumnWidth(this.column, newWidth, finished);
    }

    public onIndividualColumnResized(column: Column) {
        if (this.column !== column) {
            return;
        }
        var newWidthPx = column.getActualWidth() + "px";
        this.eHeaderCell.style.width = newWidthPx;
    }


}
