
import { Todo, TodoStatus } from '../../domain/todos/types';
import { MOCK_TODOS } from '../mock/todos';

export class TodosRepo {
  // In a real DB, we'd index by owner_id
  getAll(ownerId?: string, ecosystemId?: string): Todo[] {
    let todos = MOCK_TODOS;
    if (ownerId) {
      todos = todos.filter(t => t.owner_id === ownerId);
    }
    if (ecosystemId) {
      todos = todos.filter(t => t.ecosystem_id === ecosystemId);
    }
    // Sort by status (pending first) then date desc
    return this.sortTodos(todos);
  }

  // New: Get tasks created by this user for OTHERS (monitoring advice given)
  getAssignedBy(creatorId: string, ecosystemId?: string): Todo[] {
    let todos = MOCK_TODOS.filter(t => t.created_by === creatorId && t.owner_id !== creatorId);
    
    if (ecosystemId) {
      todos = todos.filter(t => t.ecosystem_id === ecosystemId);
    }
    
    return this.sortTodos(todos);
  }

  private sortTodos(todos: Todo[]): Todo[] {
      return todos.sort((a, b) => {
        // Custom sort order: pending/in_progress -> completed -> dismissed
        const statusOrder: Record<TodoStatus, number> = {
          'in_progress': 0,
          'pending': 1,
          'completed': 2,
          'dismissed': 3
        };
        
        const statusDiff = statusOrder[a.status] - statusOrder[b.status];
        if (statusDiff !== 0) return statusDiff;

        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }

  getById(id: string): Todo | undefined {
    return MOCK_TODOS.find(t => t.id === id);
  }

  add(todo: Todo): void {
    MOCK_TODOS.push(todo);
  }

  update(id: string, updates: Partial<Todo>): void {
    const todo = this.getById(id);
    if (todo) {
      Object.assign(todo, updates);
    }
  }

  setStatus(id: string, status: TodoStatus): void {
    this.update(id, { status });
  }
}
