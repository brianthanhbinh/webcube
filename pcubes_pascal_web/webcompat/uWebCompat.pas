unit uWebCompat;
{$mode objfpc}{$H+}
{ Browser replacements for Win32/LCL helpers used by the desktop model code. }
interface

function GetTickCount: Cardinal;

implementation

uses JS;

function GetTickCount: Cardinal;
begin
  Result := Cardinal(Trunc(TJSDate.now) mod 4294967296);
end;

end.
