import { Component, OnInit, ViewChild, OnDestroy } from '@angular/core';
import { FormGroup } from '@angular/forms';
import {
	Router,
	NavigationEnd,
	RouterEvent,
	ActivatedRoute
} from '@angular/router';

import { uniqBy } from 'lodash';
import { Observable, Subject } from 'rxjs';
import { first, takeUntil, map, tap } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { LocalDataSource } from 'ng2-smart-table';
import { NbDialogService } from '@nebular/theme';

import {
	Task,
	Tag,
	OrganizationProjects,
	ComponentLayoutStyleEnum,
	TaskListTypeEnum
} from '@gauzy/models';
import { TasksStoreService } from 'apps/gauzy/src/app/@core/services/tasks-store.service';
import { TranslationBaseComponent } from 'apps/gauzy/src/app/@shared/language-base/translation-base.component';
import { DeleteConfirmationComponent } from 'apps/gauzy/src/app/@shared/user/forms/delete-confirmation/delete-confirmation.component';
import { NotesWithTagsComponent } from 'apps/gauzy/src/app/@shared/table-components/notes-with-tags/notes-with-tags.component';
import { DateViewComponent } from 'apps/gauzy/src/app/@shared/table-components/date-view/date-view.component';
import { TaskEstimateComponent } from 'apps/gauzy/src/app/@shared/table-components/task-estimate/task-estimate.component';
import { EmployeeWithLinksComponent } from 'apps/gauzy/src/app/@shared/table-components/employee-with-links/employee-with-links.component';
import { TaskTeamsComponent } from 'apps/gauzy/src/app/@shared/table-components/task-teams/task-teams.component';
import { MyTasksStoreService } from 'apps/gauzy/src/app/@core/services/my-tasks-store.service';
import { AssignedToComponent } from 'apps/gauzy/src/app/@shared/table-components/assigned-to/assigned-to.component';
import { MyTaskDialogComponent } from './../my-task-dialog/my-task-dialog.component';
import { TeamTasksStoreService } from 'apps/gauzy/src/app/@core/services/team-tasks-store.service';
import { Store } from 'apps/gauzy/src/app/@core/services/store.service';
import { OrganizationTeamsService } from 'apps/gauzy/src/app/@core/services/organization-teams.service';
import { SelectedEmployee } from 'apps/gauzy/src/app/@theme/components/header/selectors/employee/employee.component';
import { TeamTaskDialogComponent } from '../team-task-dialog/team-task-dialog.component';
import { ComponentEnum } from 'apps/gauzy/src/app/@core/constants/layout.constants';
import { StatusViewComponent } from 'apps/gauzy/src/app/@shared/table-components/status-view/status-view.component';
import { AddTaskDialogComponent } from 'apps/gauzy/src/app/@shared/tasks/add-task-dialog/add-task-dialog.component';

@Component({
	selector: 'ngx-task',
	templateUrl: './task.component.html',
	styleUrls: ['task.component.scss']
})
export class TaskComponent extends TranslationBaseComponent
	implements OnInit, OnDestroy {
	@ViewChild('tasksTable') tasksTable;
	private _ngDestroy$: Subject<void> = new Subject();
	settingsSmartTable: object;
	loading = false;
	smartTableSource = new LocalDataSource();
	form: FormGroup;
	disableButton = true;
	projects$: Observable<OrganizationProjects[]>;
	availableTasks$: Observable<Task[]>;
	tasks$: Observable<Task[]>;
	myTasks$: Observable<Task[]>;
	teamTasks$: Observable<Task[]>;
	selectedTask: Task;
	tags: Tag[];
	view: string;
	viewComponentName: ComponentEnum;
	teams;
	dataLayoutStyle = ComponentLayoutStyleEnum.TABLE;

	selectedProject$: Observable<OrganizationProjects>;
	viewMode: TaskListTypeEnum = TaskListTypeEnum.GRID;

	constructor(
		private dialogService: NbDialogService,
		private _store: TasksStoreService,
		private _myTaskStore: MyTasksStoreService,
		private _teamTaskStore: TeamTasksStoreService,
		readonly translateService: TranslateService,
		private readonly router: Router,
		private _organizationsStore: Store,
		private route: ActivatedRoute,
		private organizationTeamsService: OrganizationTeamsService
	) {
		super(translateService);
		this.tasks$ = this._store.tasks$;
		this.myTasks$ = this._myTaskStore.myTasks$;
		this.teamTasks$ = this._teamTaskStore.tasks$;
		this.setView();
	}

	ngOnInit() {
		this.storeInstance.fetchTasks();
		this._loadTableSettings();
		this.initProjectFilter();
		this._applyTranslationOnSmartTable();
		this.router.events
			.pipe(takeUntil(this._ngDestroy$))
			.subscribe((event: RouterEvent) => {
				if (event instanceof NavigationEnd) {
					this.setView();
				}
			});

		this.route.queryParamMap
			.pipe(takeUntil(this._ngDestroy$))
			.subscribe((params) => {
				if (params.get('openAddDialog')) {
					this.createTaskDialog();
				}
			});
	}

	initProjectFilter(): void {
		this.selectedProject$ = this._organizationsStore.selectedProject$.pipe(
			tap((selectedProject: OrganizationProjects) => {
				if (!!selectedProject) {
					this.viewMode = selectedProject.taskListType as TaskListTypeEnum;
				} else {
					this.viewMode = TaskListTypeEnum.GRID;
				}
			})
		);
		this.projects$ = this.availableTasks$.pipe(
			map((tasks: Task[]): OrganizationProjects[] => {
				return uniqBy(
					tasks
						.filter((t) => t.project)
						.map(
							(task: Task): OrganizationProjects => task.project
						),
					'id'
				);
			})
		);
	}

	selectProject(project: OrganizationProjects | null): void {
		this._organizationsStore.selectedProject = project;
		this.initTasks();
		this.viewMode = !!project
			? (project.taskListType as TaskListTypeEnum)
			: TaskListTypeEnum.GRID;

		if (!!project) {
			this.availableTasks$ = this.availableTasks$.pipe(
				map((tasks: Task[]) =>
					tasks.filter((task: Task) => task.project.id === project.id)
				)
			);
		}
	}

	private initTasks(): void {
		const pathName = window.location.href;
		if (pathName.indexOf('tasks/me') !== -1) {
			this.availableTasks$ = this.myTasks$;
			return;
		}
		if (pathName.indexOf('tasks/team') !== -1) {
			this.availableTasks$ = this.teamTasks$;
			return;
		}
		this.availableTasks$ = this.tasks$;
	}

	setView() {
		this.initTasks();
		const pathName = window.location.href;
		if (pathName.indexOf('tasks/me') !== -1) {
			this._myTaskStore.fetchTasks();
			this.view = 'my-tasks';
			this.viewComponentName = ComponentEnum.MY_TASKS;
			// this.availableTasks$ = this.myTasks$;
		} else if (pathName.indexOf('tasks/team') !== -1) {
			this.view = 'team-tasks';
			this.viewComponentName = ComponentEnum.TEAM_TASKS;
			this._teamTaskStore.fetchTasks();
			// load teams for the select box of teams column
			this.loadTeams();
			this._organizationsStore.selectedEmployee$
				.pipe(takeUntil(this._ngDestroy$))
				.subscribe((selectedEmployee: SelectedEmployee) => {
					if (selectedEmployee) {
						this.loadTeams(selectedEmployee.id);
						this.storeInstance.fetchTasks(selectedEmployee.id);
					}
				});
			this._organizationsStore.selectedOrganization$
				.pipe(takeUntil(this._ngDestroy$))
				.subscribe(() => {
					this.loadTeams();
				});
			// this.availableTasks$ = this.teamTasks$;
		} else {
			this.view = 'tasks';
			this.viewComponentName = ComponentEnum.ALL_TASKS;
			// this.availableTasks$ = this.tasks$;
		}
		this._organizationsStore
			.componentLayout$(this.viewComponentName)
			.pipe(takeUntil(this._ngDestroy$))
			.subscribe(
				(componentLayout) => (this.dataLayoutStyle = componentLayout)
			);
	}

	private _applyTranslationOnSmartTable() {
		this.translateService.onLangChange
			.pipe(takeUntil(this._ngDestroy$))
			.subscribe(() => {
				this._loadTableSettings();
			});
	}

	private _loadTableSettings() {
		this.settingsSmartTable = {
			actions: false,
			columns: {
				description: {
					title: this.getTranslation('TASKS_PAGE.TASKS_TITLE'),
					type: 'custom',
					filter: true,
					class: 'align-row',
					renderComponent: NotesWithTagsComponent
				},
				projectName: {
					title: this.getTranslation('TASKS_PAGE.TASKS_PROJECT'),
					type: 'string',
					filter: false
				},
				creator: {
					title: this.getTranslation('TASKS_PAGE.TASKS_CREATOR'),
					type: 'string',
					filter: false
				},
				...this.getColumnsByPage(),
				estimate: {
					title: this.getTranslation('TASKS_PAGE.ESTIMATE'),
					type: 'custom',
					filter: false,
					renderComponent: TaskEstimateComponent
				},
				dueDate: {
					title: this.getTranslation('TASKS_PAGE.DUE_DATE'),
					type: 'custom',
					filter: false,
					renderComponent: DateViewComponent
				},
				status: {
					title: this.getTranslation('TASKS_PAGE.TASKS_STATUS'),
					type: 'custom',
					width: '15%',
					filter: false,
					renderComponent: StatusViewComponent
				}
			}
		};
	}

	private getColumnsByPage() {
		if (this.isTasksPage()) {
			return {
				employees: {
					title: this.getTranslation('TASKS_PAGE.TASK_MEMBERS'),
					type: 'custom',
					filter: false,
					renderComponent: EmployeeWithLinksComponent
				},
				teams: {
					title: this.getTranslation('TASKS_PAGE.TASK_TEAMS'),
					type: 'custom',
					filter: false,
					renderComponent: TaskTeamsComponent
				}
			};
		} else if (this.isMyTasksPage()) {
			return {
				assignTo: {
					title: this.getTranslation('TASKS_PAGE.TASK_ASSIGNED_TO'),
					type: 'custom',
					filter: false,
					renderComponent: AssignedToComponent
				}
			};
		} else if (this.isTeamTaskPage()) {
			return {
				assignTo: {
					title: this.getTranslation('TASKS_PAGE.TASK_ASSIGNED_TO'),
					type: 'custom',
					filter: {
						type: 'list',
						config: {
							selectText: 'Select',
							list: (this.teams || []).map((team) => {
								if (team) {
									return {
										title: team.name,
										value: team.name
									};
								}
							})
						}
					},
					renderComponent: AssignedToComponent
				}
			};
		} else {
			return {};
		}
	}

	async createTaskDialog() {
		let dialog;
		if (this.isTasksPage()) {
			dialog = this.dialogService.open(AddTaskDialogComponent, {
				context: {}
			});
		} else if (this.isMyTasksPage()) {
			dialog = this.dialogService.open(MyTaskDialogComponent, {
				context: {}
			});
		} else if (this.isTeamTaskPage()) {
			dialog = this.dialogService.open(TeamTaskDialogComponent, {
				context: {}
			});
		}
		if (dialog) {
			const data = await dialog.onClose.pipe(first()).toPromise();

			if (data) {
				const { estimateDays, estimateHours, estimateMinutes } = data;

				const estimate =
					estimateDays * 24 * 60 * 60 +
					estimateHours * 60 * 60 +
					estimateMinutes * 60;

				estimate ? (data.estimate = estimate) : (data.estimate = null);

				this.storeInstance.createTask(data);
				this.selectTask({ isSelected: false, data: null });
			}
		}
	}

	async editTaskDialog(selectedItem?: Task) {
		if (selectedItem) {
			this.selectTask({
				isSelected: true,
				data: selectedItem
			});
		}
		let dialog;
		if (this.isTasksPage()) {
			dialog = this.dialogService.open(AddTaskDialogComponent, {
				context: {
					task: this.selectedTask
				}
			});
		} else if (this.isMyTasksPage()) {
			dialog = this.dialogService.open(MyTaskDialogComponent, {
				context: {
					selectedTask: this.selectedTask
				}
			});
		} else if (this.isTeamTaskPage()) {
			dialog = this.dialogService.open(TeamTaskDialogComponent, {
				context: {
					selectedTask: this.selectedTask
				}
			});
		}
		if (dialog) {
			const data = await dialog.onClose.pipe(first()).toPromise();

			if (data) {
				const { estimateDays, estimateHours, estimateMinutes } = data;

				const estimate =
					estimateDays * 24 * 60 * 60 +
					estimateHours * 60 * 60 +
					estimateMinutes * 60;

				estimate ? (data.estimate = estimate) : (data.estimate = null);

				this.storeInstance.editTask({
					...data,
					id: this.selectedTask.id
				});
				this.selectTask({ isSelected: false, data: null });
			}
		}
	}

	async duplicateTaskDialog(selectedItem?: Task) {
		this.selectTask({
			isSelected: true,
			data: selectedItem
		});
		let dialog;
		if (this.isTasksPage()) {
			dialog = this.dialogService.open(AddTaskDialogComponent, {
				context: {
					task: this.selectedTask
				}
			});
		} else if (this.isMyTasksPage()) {
			const selectedTask: Task = Object.assign({}, this.selectedTask);
			// while duplicate my task, default selected employee should be logged in employee
			selectedTask.members = null;
			dialog = this.dialogService.open(MyTaskDialogComponent, {
				context: {
					selectedTask: selectedTask
				}
			});
		} else if (this.isTeamTaskPage()) {
			dialog = this.dialogService.open(TeamTaskDialogComponent, {
				context: {
					selectedTask: this.selectedTask
				}
			});
		}
		if (dialog) {
			const data = await dialog.onClose.pipe(first()).toPromise();

			if (data) {
				const { estimateDays, estimateHours, estimateMinutes } = data;

				const estimate =
					estimateDays * 24 * 60 * 60 +
					estimateHours * 60 * 60 +
					estimateMinutes * 60;

				estimate ? (data.estimate = estimate) : (data.estimate = null);

				this.storeInstance.createTask(data);
				this.selectTask({ isSelected: false, data: null });
			}
		}
	}

	async deleteTask(selectedItem?: Task) {
		this.selectTask({
			isSelected: true,
			data: selectedItem
		});
		const result = await this.dialogService
			.open(DeleteConfirmationComponent)
			.onClose.pipe(first())
			.toPromise();

		if (result) {
			this.storeInstance.delete(this.selectedTask.id);
			this.selectTask({ isSelected: false, data: null });
		}
	}

	selectTask({ isSelected, data }) {
		const selectedTask = isSelected ? data : null;
		if (this.tasksTable) {
			this.tasksTable.grid.dataSet.willSelect = false;
		}
		this.disableButton = !isSelected;
		this.selectedTask = selectedTask;
	}

	async loadTeams(employeeId?: string) {
		if (this._organizationsStore.selectedOrganization) {
			const organizationId = this._organizationsStore.selectedOrganization
				.id;
			if (!organizationId) {
				return;
			}
			this.teams = (
				await this.organizationTeamsService.getMyTeams(
					['members'],
					{},
					employeeId
				)
			).items.filter((org) => {
				return org.organizationId === organizationId;
			});
			this._loadTableSettings();
		}
	}

	isTasksPage() {
		return this.view === 'tasks';
	}

	isMyTasksPage() {
		return this.view === 'my-tasks';
	}

	isTeamTaskPage() {
		return this.view === 'team-tasks';
	}

	openTasksSettings(selectedProject: OrganizationProjects): void {
		this.router.navigate(['/pages/tasks/settings', selectedProject.id], {
			state: selectedProject
		});
	}

	/**
	 * return store instace as per page
	 */
	get storeInstance() {
		if (this.isTasksPage()) {
			return this._store;
		} else if (this.isMyTasksPage()) {
			return this._myTaskStore;
		} else if (this.isTeamTaskPage()) {
			return this._teamTaskStore;
		}
	}

	ngOnDestroy(): void {
		this._ngDestroy$.next();
		this._ngDestroy$.complete();
	}
}
