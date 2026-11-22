unit Dialogs;
{$mode objfpc}{$H+}
{ UI-free fallback. Browser-facing messages are handled by the web bridge. }
interface
procedure ShowMessage(const Msg:string);
implementation
procedure ShowMessage(const Msg:string);
begin
  { Intentionally no-op; the browser adapter owns visible diagnostics. }
end;
end.