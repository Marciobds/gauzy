import { Component, Input } from '@angular/core';
import { ViewCell } from 'ng2-smart-table';

@Component({
	templateUrl: './proposal-status.component.html',
	styleUrls: ['./proposal-status.component.scss']
})
export class ProposalStatusComponent implements ViewCell {
	@Input()
	rowData: any;
	value: string | number;
}
